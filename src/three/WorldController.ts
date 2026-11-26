import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { soundEngine } from '../game/audio';
import { BRANCH_SPECS } from '../game/config';
import { clamp } from '../game/formulas';
import { CameraPresetId, GameSpeed, GameState, PondState, ProjectedNpcBubble } from '../game/types';
import {
  createEnvironmentScenery,
  createFarmBuildings,
  createKioskPlotAssembly,
  createNpcActors,
  createPondAssembly,
  createSpeciesFishGeometries,
  disposeObject3D,
  KIOSK_SLOTS_POS,
  KioskPlotVisualHandle,
  pickContextualSpeech,
  POND_SLOTS_POS,
  PondVisualHandle,
  SpeciesFishGeometries,
} from './models';
import { RealisticRenderEngine } from './RenderEngine';
import { createProceduralTextures } from './textures';

const CAMERA_PRESETS: Record<CameraPresetId, { pos: [number, number, number]; target: [number, number, number] }> = {
  overview: { pos: [0, 19.5, 28], target: [-0.5, 0.5, 1.5] },
  ponds: { pos: [-0.5, 13.5, 14.5], target: [-0.5, 0.4, -2.0] },
  river: { pos: [10, 8.5, 25.5], target: [-1.0, 0.5, 17.8] },
  buildings: { pos: [21, 11.5, 17], target: [8, 1.2, 2.5] },
  aerial: { pos: [0, 35, 14], target: [-0.5, 0, 1] },
};

const TREE_GROVE_ANCHORS: Array<[number, number, number]> = [
  [-16, 3.2, -18],
  [21, 3.2, -16],
  [-25, 3.0, 6],
  [25, 3.0, -5],
  [-4, 3.0, 26],
  [14, 3.0, 26],
];

const VILLAGE_LIFE_ANCHORS: Array<[number, number, number]> = [
  [0, 1.4, 11.5], // Kiosk plaza & main road
  [-11, 1.5, 25.5], // West village houses
  [8, 1.5, 25.5], // East village houses
  [16.5, 1.5, 4.0], // Main market hub
];

const RAIN_COUNT = 780;
const MAX_RAIN_SPLASHES = 96;
const HEAT_SHIMMER_COUNT = 320;

const _camPosGoal = new THREE.Vector3();
const _camTargetGoal = new THREE.Vector3();
const _npcDir = new THREE.Vector3();
const _projVec = new THREE.Vector3();
const _pondWaterWork = new THREE.Color();
const _pondDirtyTint = new THREE.Color(0x4d7c3f);
const _pondBioflokClear = new THREE.Color(0x7c6f4a);
const _dummySplash = new THREE.Object3D();

// Scratch vectors for zero-GC spatial audio distance & stereo panning calculations
const _camRight = new THREE.Vector3();
const _toEmitter = new THREE.Vector3();
const _emitterPos = new THREE.Vector3();
const _nearestPos = new THREE.Vector3();

interface SpatialAudioGraph {
  ctx: AudioContext;
  masterGain: GainNode;
  noiseBuffer: AudioBuffer;
  // Wind layer
  windSource: AudioBufferSourceNode;
  windFilter: BiquadFilterNode;
  windAirFilter: BiquadFilterNode;
  windPan: StereoPannerNode;
  windGain: GainNode;
  // Water ripples layer
  waterSource: AudioBufferSourceNode;
  waterFilter: BiquadFilterNode;
  waterAirFilter: BiquadFilterNode;
  waterPan: StereoPannerNode;
  waterGain: GainNode;
  // Rain ambience layer
  rainSource: AudioBufferSourceNode;
  rainFilter: BiquadFilterNode;
  rainGain: GainNode;
  // Distant village life layer (+ moving feed truck purr)
  villageSource: AudioBufferSourceNode;
  villageFilter: BiquadFilterNode;
  villageAirFilter: BiquadFilterNode;
  villagePan: StereoPannerNode;
  villageGain: GainNode;
  truckOsc: OscillatorNode;
  truckFilter: BiquadFilterNode;
  truckPan: StereoPannerNode;
  truckGain: GainNode;
}

export interface WorldControllerHooks {
  onSelectPond: (slotIndex: number) => void;
  onTickFrame: (rawDtSeconds: number) => void;
  onUpdateNpcBubbles?: (bubbles: ProjectedNpcBubble[]) => void;
  getLatestState: () => {
    gameState: GameState;
    selectedSlot: number | null;
    speed: GameSpeed;
    isTitleScreen: boolean;
  };
}

export class WorldController {
  private container: HTMLElement;
  private hooks: WorldControllerHooks;
  private engine: RealisticRenderEngine;
  private controls: OrbitControls;

  private pondHandles: PondVisualHandle[] = [];
  private kioskHandles: KioskPlotVisualHandle[] = [];
  private buildingsHandle: ReturnType<typeof createFarmBuildings>;
  private npcs: ReturnType<typeof createNpcActors>;
  private scenery: ReturnType<typeof createEnvironmentScenery>;

  // Weather particle & mirage systems
  private rainLines: THREE.LineSegments;
  private rainLineMat: THREE.LineBasicMaterial;
  private rainPositions: Float32Array;
  private rainDrops: Float32Array; // x, y, z, speed per drop
  private rainSplashesMesh: THREE.InstancedMesh;
  private rainSplashMat: THREE.MeshBasicMaterial;
  private rainSplashData: Float32Array; // x, y, z, age (<=0 inactive)
  private nextRainSplashIdx = 0;

  private heatShimmerPoints: THREE.Points;
  private heatShimmerMat: THREE.ShaderMaterial;
  private heatShimmerSeeds: Float32Array; // baseX, baseZ, phase, speed
  private heatShimmerPos: Float32Array;
  private heatHazeMesh: THREE.Mesh;
  private heatHazeMat: THREE.ShaderMaterial;

  private rainBlend = 0;
  private heatBlend = 0;

  // Spatial audio system state
  private audioGraph: SpatialAudioGraph | null = null;
  private birdTimer = 1.4;
  private waterPlinkTimer = 0.6;
  private villageChimeTimer = 3.5;
  private thunderTimer = 7.0;

  private textures: ReturnType<typeof createProceduralTextures>;
  private fishGeometries: SpeciesFishGeometries;
  private lastBranchId: string | null = null;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerDownPos = { x: 0, y: 0 };

  private cameraTransitionActive = false;
  private frameId = 0;
  private disposed = false;
  private lastTimestamp = performance.now();
  private elapsed = 0;
  private npcBubbleEmitTimer = 0;
  private npcActiveLines: Record<string, string> = {};
  private windAngle = 0.35;

  constructor(container: HTMLElement, hooks: WorldControllerHooks) {
    this.container = container;
    this.hooks = hooks;

    this.engine = new RealisticRenderEngine(container);

    this.controls = new OrbitControls(this.engine.camera, this.engine.renderer.domElement);
    this.controls.enableDamping = !this.engine.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI * 0.45;
    this.controls.minPolarAngle = 0.22;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 54;
    this.controls.target.set(-0.5, 0.5, 1.5);
    this.controls.addEventListener('start', () => {
      this.cameraTransitionActive = false;
    });

    // Procedural Assets
    const maxAniso = this.engine.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);
    this.fishGeometries = createSpeciesFishGeometries();

    this.scenery = createEnvironmentScenery(this.textures, this.engine.isSoftwareGl);
    this.engine.scene.add(this.scenery.root);

    this.buildingsHandle = createFarmBuildings(this.textures);
    this.engine.scene.add(this.buildingsHandle.root);

    POND_SLOTS_POS.forEach(([px, pz], idx) => {
      const ph = createPondAssembly(idx, px, pz, this.textures, this.fishGeometries);
      this.pondHandles.push(ph);
      this.engine.scene.add(ph.root);
    });

    KIOSK_SLOTS_POS.forEach(([kx, kz]) => {
      const kh = createKioskPlotAssembly(kx, kz, this.textures);
      this.kioskHandles.push(kh);
      this.engine.scene.add(kh.root);
    });

    this.npcs = createNpcActors(this.textures);
    for (const npc of this.npcs) {
      this.engine.scene.add(npc.group);
      this.npcActiveLines[npc.id] = npc.speechLines[npc.currentLineIndex % npc.speechLines.length] ?? '';
    }

    // --- 1. Particle Weather: Diagonal Rain Streaks + Surface Splash Rings ('Hujan Deras') ---
    this.rainPositions = new Float32Array(RAIN_COUNT * 6); // 2 vertices per streak
    this.rainDrops = new Float32Array(RAIN_COUNT * 4);
    for (let i = 0; i < RAIN_COUNT; i++) {
      const rx = (Math.random() - 0.5) * 62;
      const ry = Math.random() * 24;
      const rz = (Math.random() - 0.5) * 58 + 3;
      const spd = 20 + Math.random() * 8;
      this.rainDrops[i * 4] = rx;
      this.rainDrops[i * 4 + 1] = ry;
      this.rainDrops[i * 4 + 2] = rz;
      this.rainDrops[i * 4 + 3] = spd;
      this.syncRainStreakVertex(i);
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rainLineMat = new THREE.LineBasicMaterial({
      color: 0xcbe7ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.rainLines = new THREE.LineSegments(rainGeo, this.rainLineMat);
    this.rainLines.visible = false;
    this.rainLines.frustumCulled = false;
    this.engine.scene.add(this.rainLines);

    const rainSplashGeo = new THREE.RingGeometry(0.055, 0.105, 14);
    rainSplashGeo.rotateX(-Math.PI / 2);
    this.rainSplashMat = new THREE.MeshBasicMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.rainSplashesMesh = new THREE.InstancedMesh(rainSplashGeo, this.rainSplashMat, MAX_RAIN_SPLASHES);
    this.rainSplashesMesh.frustumCulled = false;
    this.rainSplashesMesh.visible = false;
    this.rainSplashData = new Float32Array(MAX_RAIN_SPLASHES * 4);
    this.engine.scene.add(this.rainSplashesMesh);

    // --- 2. Particle Weather: Heat Shimmer Convection Particles + Thermal Mirage Plane ('Panas Terik') ---
    this.heatShimmerPos = new Float32Array(HEAT_SHIMMER_COUNT * 3);
    this.heatShimmerSeeds = new Float32Array(HEAT_SHIMMER_COUNT * 4);
    const shimmerSizes = new Float32Array(HEAT_SHIMMER_COUNT);
    const shimmerPhases = new Float32Array(HEAT_SHIMMER_COUNT);
    for (let i = 0; i < HEAT_SHIMMER_COUNT; i++) {
      const bx = (Math.random() - 0.5) * 44;
      const bz = (Math.random() - 0.5) * 42 + 2;
      const by = Math.random() * 4.4;
      this.heatShimmerPos[i * 3] = bx;
      this.heatShimmerPos[i * 3 + 1] = by;
      this.heatShimmerPos[i * 3 + 2] = bz;
      this.heatShimmerSeeds[i * 4] = bx;
      this.heatShimmerSeeds[i * 4 + 1] = bz;
      this.heatShimmerSeeds[i * 4 + 2] = Math.random() * Math.PI * 2;
      this.heatShimmerSeeds[i * 4 + 3] = 0.55 + Math.random() * 0.75;
      shimmerSizes[i] = 16 + Math.random() * 22;
      shimmerPhases[i] = Math.random() * 6.2831;
    }
    const shimmerGeo = new THREE.BufferGeometry();
    shimmerGeo.setAttribute('position', new THREE.BufferAttribute(this.heatShimmerPos, 3));
    shimmerGeo.setAttribute('aSize', new THREE.BufferAttribute(shimmerSizes, 1));
    shimmerGeo.setAttribute('aPhase', new THREE.BufferAttribute(shimmerPhases, 1));

    this.heatShimmerMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uPixelRatio: { value: this.engine.renderer.getPixelRatio() },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vAlpha;
        varying float vPhase;
        void main() {
          vPhase = aPhase;
          float hFade = smoothstep(0.0, 0.75, position.y) * (1.0 - smoothstep(2.6, 4.5, position.y));
          vAlpha = hFade;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (18.0 / max(1.0, -mvPosition.z));
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uIntensity;
        varying float vAlpha;
        varying float vPhase;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          uv.x += sin(uv.y * 14.0 + uTime * 7.0 + vPhase) * 0.14;
          float d = length(vec2(uv.x * 1.45, uv.y * 0.85));
          float soft = smoothstep(0.48, 0.04, d);
          float shimmer = 0.65 + 0.35 * sin(uTime * 8.5 + vPhase + uv.y * 10.0);
          float alpha = soft * vAlpha * uIntensity * 0.24 * shimmer;
          if (alpha < 0.005) discard;
          vec3 col = mix(vec3(1.0, 0.88, 0.58), vec3(1.0, 0.98, 0.86), shimmer);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.heatShimmerPoints = new THREE.Points(shimmerGeo, this.heatShimmerMat);
    this.heatShimmerPoints.visible = false;
    this.heatShimmerPoints.frustumCulled = false;
    this.engine.scene.add(this.heatShimmerPoints);

    // Low-altitude shimmering heat-mirage layer above pathways & pond berms
    const heatHazeGeo = new THREE.PlaneGeometry(52, 46, 1, 1);
    heatHazeGeo.rotateX(-Math.PI / 2);
    this.heatHazeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv * 12.0;
          float w1 = sin(p.x * 2.1 + uTime * 3.4 + sin(p.y * 3.2 - uTime * 2.2));
          float w2 = cos(p.y * 2.7 - uTime * 2.9 + cos(p.x * 1.9 + uTime * 1.7));
          float band = smoothstep(0.25, 0.95, 0.5 + 0.25 * (w1 + w2));
          float radialFade = 1.0 - smoothstep(0.25, 0.5, length(vUv - 0.5));
          float alpha = band * radialFade * uIntensity * 0.095;
          if (alpha < 0.003) discard;
          gl_FragColor = vec4(1.0, 0.91, 0.68, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.heatHazeMesh = new THREE.Mesh(heatHazeGeo, this.heatHazeMat);
    this.heatHazeMesh.position.set(0, 0.38, 1.5);
    this.heatHazeMesh.visible = false;
    this.engine.scene.add(this.heatHazeMesh);

    this.raycaster.layers.set(1);
    this.engine.precompile();

    this.bindEvents();
    this.startLoop();
  }

  private syncRainStreakVertex(idx: number): void {
    const dIdx = idx * 4;
    const pIdx = idx * 6;
    const rx = this.rainDrops[dIdx];
    const ry = this.rainDrops[dIdx + 1];
    const rz = this.rainDrops[dIdx + 2];
    const slantX = -0.14;
    const streakLen = 0.72;
    this.rainPositions[pIdx] = rx;
    this.rainPositions[pIdx + 1] = ry;
    this.rainPositions[pIdx + 2] = rz;
    this.rainPositions[pIdx + 3] = rx - slantX;
    this.rainPositions[pIdx + 4] = ry + streakLen;
    this.rainPositions[pIdx + 5] = rz - 0.05;
  }

  private spawnRainSplash(x: number, y: number, z: number): void {
    const idx = this.nextRainSplashIdx * 4;
    this.rainSplashData[idx] = x;
    this.rainSplashData[idx + 1] = y;
    this.rainSplashData[idx + 2] = z;
    this.rainSplashData[idx + 3] = 1.0;
    this.nextRainSplashIdx = (this.nextRainSplashIdx + 1) % MAX_RAIN_SPLASHES;
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onUserAudioGesture);
    window.addEventListener('pointerdown', this.onUserAudioGesture);
    const dom = this.engine.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointerup', this.onPointerUp);
  }

  private onUserAudioGesture = (): void => {
    if (this.disposed) return;
    const ctx = soundEngine.unlock();
    if (ctx && !this.audioGraph) {
      this.initSpatialAudioGraph(ctx);
    }
  };

  private initSpatialAudioGraph(ctx: AudioContext): void {
    if (this.audioGraph) return;

    // 3-second seamless pink-tinted noise buffer for wind, water, rain & village layers
    const len = Math.floor(ctx.sampleRate * 3.0);
    const noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = noiseBuffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      ch[i] = (b0 + b1 + b2 + white * 0.12) * 0.42;
    }

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(ctx.destination);

    // 1. Wind layer
    const windSource = ctx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 340;
    windFilter.Q.value = 1.2;
    const windAirFilter = ctx.createBiquadFilter();
    windAirFilter.type = 'lowpass';
    windAirFilter.frequency.value = 2200;
    const windPan = ctx.createStereoPanner();
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter);
    windFilter.connect(windAirFilter);
    windAirFilter.connect(windPan);
    windPan.connect(windGain);
    windGain.connect(masterGain);
    windSource.start();

    // 2. Water ripples & river babble layer
    const waterSource = ctx.createBufferSource();
    waterSource.buffer = noiseBuffer;
    waterSource.loop = true;
    const waterFilter = ctx.createBiquadFilter();
    waterFilter.type = 'bandpass';
    waterFilter.frequency.value = 740;
    waterFilter.Q.value = 0.95;
    const waterAirFilter = ctx.createBiquadFilter();
    waterAirFilter.type = 'lowpass';
    waterAirFilter.frequency.value = 3400;
    const waterPan = ctx.createStereoPanner();
    const waterGain = ctx.createGain();
    waterGain.gain.value = 0;
    waterSource.connect(waterFilter);
    waterFilter.connect(waterAirFilter);
    waterAirFilter.connect(waterPan);
    waterPan.connect(waterGain);
    waterGain.connect(masterGain);
    waterSource.start(0, 0.7);

    // 3. Rain weather ambience layer
    const rainSource = ctx.createBufferSource();
    rainSource.buffer = noiseBuffer;
    rainSource.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 1750;
    rainFilter.Q.value = 0.55;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rainSource.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(masterGain);
    rainSource.start(0, 1.4);

    // 4. Distant village life murmur + moving feed-truck hum
    const villageSource = ctx.createBufferSource();
    villageSource.buffer = noiseBuffer;
    villageSource.loop = true;
    const villageFilter = ctx.createBiquadFilter();
    villageFilter.type = 'bandpass';
    villageFilter.frequency.value = 330;
    villageFilter.Q.value = 1.4;
    const villageAirFilter = ctx.createBiquadFilter();
    villageAirFilter.type = 'lowpass';
    villageAirFilter.frequency.value = 1200;
    const villagePan = ctx.createStereoPanner();
    const villageGain = ctx.createGain();
    villageGain.gain.value = 0;
    villageSource.connect(villageFilter);
    villageFilter.connect(villageAirFilter);
    villageAirFilter.connect(villagePan);
    villagePan.connect(villageGain);
    villageGain.connect(masterGain);
    villageSource.start(0, 2.1);

    const truckOsc = ctx.createOscillator();
    truckOsc.type = 'triangle';
    truckOsc.frequency.value = 72;
    const truckFilter = ctx.createBiquadFilter();
    truckFilter.type = 'lowpass';
    truckFilter.frequency.value = 190;
    const truckPan = ctx.createStereoPanner();
    const truckGain = ctx.createGain();
    truckGain.gain.value = 0;
    truckOsc.connect(truckFilter);
    truckFilter.connect(truckPan);
    truckPan.connect(truckGain);
    truckGain.connect(masterGain);
    truckOsc.start();

    this.audioGraph = {
      ctx,
      masterGain,
      noiseBuffer,
      windSource,
      windFilter,
      windAirFilter,
      windPan,
      windGain,
      waterSource,
      waterFilter,
      waterAirFilter,
      waterPan,
      waterGain,
      rainSource,
      rainFilter,
      rainGain,
      villageSource,
      villageFilter,
      villageAirFilter,
      villagePan,
      villageGain,
      truckOsc,
      truckFilter,
      truckPan,
      truckGain,
    };
  }

  private computeSpatialAttenuation(
    targetX: number,
    targetY: number,
    targetZ: number,
    minDist: number,
    maxDist: number
  ): { gain: number; pan: number; dist: number } {
    _emitterPos.set(targetX, targetY, targetZ);
    _toEmitter.subVectors(_emitterPos, this.engine.camera.position);
    const dist = _toEmitter.length();
    const norm = clamp(1 - (dist - minDist) / Math.max(1, maxDist - minDist), 0.03, 1);
    const gain = Math.pow(norm, 1.55);
    const pan = dist > 0.01 ? clamp(_toEmitter.divideScalar(dist).dot(_camRight), -0.88, 0.88) : 0;
    return { gain, pan, dist };
  }

  private triggerBirdOrCricketCall(
    graph: SpatialAudioGraph,
    pan: number,
    gainScale: number,
    isNight: boolean
  ): void {
    const now = graph.ctx.currentTime;
    if (isNight) {
      // Soft evening cricket pulses
      for (let i = 0; i < 3; i++) {
        const osc = graph.ctx.createOscillator();
        const g = graph.ctx.createGain();
        const p = graph.ctx.createStereoPanner();
        p.pan.value = pan;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(4150 + (i % 2) * 140, now + i * 0.065);
        g.gain.setValueAtTime(0.0001, now + i * 0.065);
        g.gain.linearRampToValueAtTime(0.012 * gainScale, now + i * 0.065 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.065 + 0.052);
        osc.connect(g);
        g.connect(p);
        p.connect(graph.masterGain);
        osc.start(now + i * 0.065);
        osc.stop(now + i * 0.065 + 0.06);
      }
      return;
    }

    // Tropical songbird 2-3 note chirp
    const noteCount = 2 + Math.floor(Math.random() * 2);
    const baseFreq = 2150 + Math.random() * 1100;
    for (let i = 0; i < noteCount; i++) {
      const t0 = now + i * 0.11;
      const osc = graph.ctx.createOscillator();
      const g = graph.ctx.createGain();
      const p = graph.ctx.createStereoPanner();
      p.pan.value = pan;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * (0.95 + i * 0.09), t0);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * (1.28 + Math.random() * 0.16), t0 + 0.055);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.92, t0 + 0.095);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.022 * gainScale, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.095);
      osc.connect(g);
      g.connect(p);
      p.connect(graph.masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.105);
    }
  }

  private triggerWaterRipplePlink(
    graph: SpatialAudioGraph,
    pan: number,
    gainScale: number
  ): void {
    const now = graph.ctx.currentTime;
    const osc = graph.ctx.createOscillator();
    const g = graph.ctx.createGain();
    const p = graph.ctx.createStereoPanner();
    p.pan.value = pan;
    const f = 540 + Math.random() * 480;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, now);
    osc.frequency.exponentialRampToValueAtTime(f * 1.48, now + 0.075);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.015 * gainScale, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);
    osc.connect(g);
    g.connect(p);
    p.connect(graph.masterGain);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  private triggerVillageWoodKnock(
    graph: SpatialAudioGraph,
    pan: number,
    gainScale: number
  ): void {
    const now = graph.ctx.currentTime;
    const osc = graph.ctx.createOscillator();
    const filter = graph.ctx.createBiquadFilter();
    const g = graph.ctx.createGain();
    const p = graph.ctx.createStereoPanner();
    p.pan.value = pan;
    osc.type = 'triangle';
    const base = 290 + Math.random() * 140;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.65, now + 0.14);
    filter.type = 'lowpass';
    filter.frequency.value = 720;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.018 * gainScale, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(filter);
    filter.connect(g);
    g.connect(p);
    p.connect(graph.masterGain);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  private triggerDistantThunder(graph: SpatialAudioGraph): void {
    const now = graph.ctx.currentTime;
    const src = graph.ctx.createBufferSource();
    src.buffer = graph.noiseBuffer;
    const filter = graph.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, now);
    filter.frequency.exponentialRampToValueAtTime(55, now + 1.8);
    const g = graph.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.11, now + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.1);
    src.connect(filter);
    filter.connect(g);
    g.connect(graph.masterGain);
    src.start(now);
    src.stop(now + 2.2);
  }

  private updateSpatialAudio(
    dt: number,
    state: GameState,
    daylight: number,
    isTitleScreen: boolean
  ): void {
    const graph = this.audioGraph;
    if (!graph) {
      const existing = soundEngine.getContext();
      if (existing) {
        this.initSpatialAudioGraph(existing);
      }
      return;
    }

    const now = graph.ctx.currentTime;
    const muted = soundEngine.isMuted() || document.hidden;
    const targetMaster = muted ? 0 : isTitleScreen ? 0.42 : 1.0;
    graph.masterGain.gain.setTargetAtTime(targetMaster, now, 0.12);
    if (muted || graph.ctx.state !== 'running') return;

    const cam = this.engine.camera;
    _camRight.set(1, 0, 0).applyQuaternion(cam.quaternion).normalize();

    // 1. Wind spatial layer (perimeter tree groves + altitude breeze)
    let bestTreeDist = 999;
    let bestTreeIdx = 0;
    for (let i = 0; i < TREE_GROVE_ANCHORS.length; i++) {
      const [tx, ty, tz] = TREE_GROVE_ANCHORS[i];
      const d = _nearestPos.set(tx, ty, tz).distanceTo(cam.position);
      if (d < bestTreeDist) {
        bestTreeDist = d;
        bestTreeIdx = i;
      }
    }
    const [treeX, treeY, treeZ] = TREE_GROVE_ANCHORS[bestTreeIdx];
    const windSpatial = this.computeSpatialAttenuation(treeX, treeY, treeZ, 6, 48);
    const altWindBoost = clamp((cam.position.y - 10) / 26, 0, 0.55);
    const weatherWindFactor =
      state.weather === 'Angin Kencang'
        ? 1.85
        : state.weather === 'Hujan Deras'
        ? 1.35
        : state.weather === 'Mendung'
        ? 0.85
        : 0.55;
    const gust = 0.72 + 0.28 * Math.sin(this.elapsed * 0.55) + 0.14 * Math.sin(this.elapsed * 1.4);
    const targetWindGain = clamp((windSpatial.gain * 0.45 + altWindBoost) * weatherWindFactor * gust * 0.085, 0, 0.2);

    graph.windFilter.frequency.setTargetAtTime(
      (state.weather === 'Angin Kencang' ? 460 : 300) + Math.sin(this.elapsed * 0.4) * 95,
      now,
      0.2
    );
    graph.windAirFilter.frequency.setTargetAtTime(
      clamp(2600 - windSpatial.dist * 32, 900, 3200),
      now,
      0.15
    );
    graph.windPan.pan.setTargetAtTime(windSpatial.pan * 0.65, now, 0.1);
    graph.windGain.gain.setTargetAtTime(targetWindGain, now, 0.18);

    // 2. Water ripples & river flow spatial layer (closest river point vs closest active fish pond)
    const riverClampX = clamp(cam.position.x, -30, 30);
    const riverSpatial = this.computeSpatialAttenuation(riverClampX, 0.2, 18.5, 4, 34);

    let bestPondGain = 0;
    let bestPondPan = 0;
    let bestPondDist = 999;
    let pondAerationFactor = 0.4;
    const branchPonds = state.ponds.filter((p) => p.branchId === state.activeBranch);
    for (let i = 0; i < branchPonds.length; i++) {
      const p = branchPonds[i];
      if (!p.unlocked || !p.built || p.pondType === 'kios') continue;
      const coords = POND_SLOTS_POS[p.slotIndex];
      if (!coords) continue;
      const s = this.computeSpatialAttenuation(coords[0], 0.7, coords[1], 4, 24);
      const aeroMult = 0.55 + p.upgrades.aerator * 0.16 + (p.pondType === 'bioflok' ? 0.25 : 0);
      if (s.gain * aeroMult > bestPondGain) {
        bestPondGain = s.gain * aeroMult;
        bestPondPan = s.pan;
        bestPondDist = s.dist;
        pondAerationFactor = aeroMult;
      }
    }

    const useRiver = riverSpatial.gain >= bestPondGain * 0.82;
    const waterActiveGain = useRiver ? riverSpatial.gain : bestPondGain;
    const waterActivePan = useRiver ? riverSpatial.pan : bestPondPan;
    const waterActiveDist = useRiver ? riverSpatial.dist : bestPondDist;

    graph.waterFilter.frequency.setTargetAtTime(
      useRiver ? 680 + Math.sin(this.elapsed * 0.9) * 80 : 840 + pondAerationFactor * 160,
      now,
      0.15
    );
    graph.waterAirFilter.frequency.setTargetAtTime(
      clamp(4200 - waterActiveDist * 85, 900, 4400),
      now,
      0.12
    );
    graph.waterPan.pan.setTargetAtTime(waterActivePan, now, 0.1);
    graph.waterGain.gain.setTargetAtTime(clamp(waterActiveGain * 0.14, 0, 0.16), now, 0.15);

    this.waterPlinkTimer -= dt;
    if (this.waterPlinkTimer <= 0) {
      this.waterPlinkTimer = (0.35 + Math.random() * 0.75) / Math.max(0.55, pondAerationFactor);
      if (waterActiveGain > 0.08 && !isTitleScreen) {
        this.triggerWaterRipplePlink(graph, waterActivePan, waterActiveGain);
      }
    }

    // 3. Weather Rain & Thunder layer
    const camHeightFactor = clamp(1 - (cam.position.y - 8) / 36, 0.35, 1.0);
    graph.rainGain.gain.setTargetAtTime(this.rainBlend * 0.14 * camHeightFactor, now, 0.25);
    graph.rainFilter.frequency.setTargetAtTime(
      1100 + camHeightFactor * 1100,
      now,
      0.2
    );
    if (this.rainBlend > 0.65) {
      this.thunderTimer -= dt;
      if (this.thunderTimer <= 0) {
        this.thunderTimer = 9 + Math.random() * 14;
        this.triggerDistantThunder(graph);
      }
    }

    // 4. Bird chirps (daytime trees) & Night crickets
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      const isNight = daylight <= 0.3;
      this.birdTimer = isNight ? 1.8 + Math.random() * 2.4 : 2.1 + Math.random() * 3.6;
      if (this.rainBlend < 0.35 && windSpatial.gain > 0.06) {
        this.triggerBirdOrCricketCall(graph, windSpatial.pan, windSpatial.gain, isNight);
      }
    }

    // 5. Distant village life & feed transport truck spatial layer
    let bestVillageGain = 0;
    let bestVillagePan = 0;
    let bestVillageDist = 999;
    for (let i = 0; i < VILLAGE_LIFE_ANCHORS.length; i++) {
      const [vx, vy, vz] = VILLAGE_LIFE_ANCHORS[i];
      const s = this.computeSpatialAttenuation(vx, vy, vz, 5, 36);
      if (s.gain > bestVillageGain) {
        bestVillageGain = s.gain;
        bestVillagePan = s.pan;
        bestVillageDist = s.dist;
      }
    }
    const builtKioskCount = state.kioskPlots.filter((k) => k.branchId === state.activeBranch && k.built).length;
    const villageActivity = (0.35 + daylight * 0.65) * (1 + builtKioskCount * 0.12) * (1 - this.rainBlend * 0.55);

    graph.villageAirFilter.frequency.setTargetAtTime(
      clamp(2200 - bestVillageDist * 45, 520, 2200),
      now,
      0.15
    );
    graph.villagePan.pan.setTargetAtTime(bestVillagePan, now, 0.1);
    graph.villageGain.gain.setTargetAtTime(clamp(bestVillageGain * villageActivity * 0.055, 0, 0.08), now, 0.2);

    // Feed truck spatial engine purr
    const truckPos = this.scenery.feedTruck.group.position;
    const truckSpatial = this.computeSpatialAttenuation(truckPos.x, 0.8, truckPos.z, 3.5, 28);
    const truckMoving = this.scenery.feedTruck.pauseTimer <= 0;
    graph.truckOsc.frequency.setTargetAtTime(truckMoving ? 76 : 54, now, 0.15);
    graph.truckPan.pan.setTargetAtTime(truckSpatial.pan, now, 0.08);
    graph.truckGain.gain.setTargetAtTime(
      truckSpatial.gain * (truckMoving ? 0.028 : 0.008),
      now,
      0.15
    );

    this.villageChimeTimer -= dt;
    if (this.villageChimeTimer <= 0) {
      this.villageChimeTimer = 3.8 + Math.random() * 5.2;
      if (bestVillageGain > 0.1 && villageActivity > 0.45 && !isTitleScreen) {
        this.triggerVillageWoodKnock(graph, bestVillagePan, bestVillageGain);
      }
    }
  }

  private onResize = (): void => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.engine.resize(w, h);
    this.heatShimmerMat.uniforms.uPixelRatio.value = this.engine.renderer.getPixelRatio();
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.pointerDownPos.x = e.clientX;
    this.pointerDownPos.y = e.clientY;
  };

  private onPointerUp = (e: PointerEvent): void => {
    const dx = e.clientX - this.pointerDownPos.x;
    const dy = e.clientY - this.pointerDownPos.y;
    if (dx * dx + dy * dy > 36) return;

    const { isTitleScreen } = this.hooks.getLatestState();
    if (isTitleScreen) return;

    const rect = this.engine.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.engine.camera);
    const visibleHitBoxes = this.pondHandles.filter((p) => p.root.visible).map((p) => p.hitBox);
    const hits = this.raycaster.intersectObjects(visibleHitBoxes, false);
    if (hits.length > 0) {
      const slot = hits[0].object.userData.pondSlot;
      if (typeof slot === 'number') {
        this.hooks.onSelectPond(slot);
      }
    }
  };

  public setCameraPreset(preset: CameraPresetId): void {
    const cfg = CAMERA_PRESETS[preset];
    _camPosGoal.set(...cfg.pos);
    _camTargetGoal.set(...cfg.target);
    this.cameraTransitionActive = true;
  }

  public focusPondSlot(slotIndex: number): void {
    const pos = POND_SLOTS_POS[slotIndex];
    if (!pos) return;
    _camTargetGoal.set(pos[0], 0.6, pos[1]);
    _camPosGoal.set(pos[0] + 5.5, 8.2, pos[1] + 9.2);
    this.cameraTransitionActive = true;
  }

  private getRainImpactSurfaceY(x: number, z: number, branchPonds: PondState[]): number {
    // Check river channel first
    if (Math.abs(z - 18.5) < 3.85) {
      return 0.055;
    }
    // Check built pond surfaces
    for (let i = 0; i < branchPonds.length; i++) {
      const p = branchPonds[i];
      if (!p.unlocked || !p.built || p.pondType === 'kios') continue;
      const coords = POND_SLOTS_POS[p.slotIndex];
      if (!coords) continue;
      if (Math.abs(x - coords[0]) < 2.25 && Math.abs(z - coords[1]) < 1.9) {
        return p.pondType === 'bioflok' ? 0.91 : p.pondType === 'ras' ? 0.83 : 0.69;
      }
    }
    return 0.03;
  }

  private updateDayNightAndWeather(state: GameState, dt: number): { daylight: number } {
    const atmo = this.engine.updateAtmosphere(state.dayProgress, state.weather, this.elapsed, dt);

    // Night illumination for village house windows, street lamps, and feed truck headlights
    const nightEmissive = clamp((1 - atmo.daylight) * 1.45, 0.08, 1.5);
    for (const mat of this.scenery.lampBulbMats) {
      mat.emissiveIntensity = nightEmissive;
    }
    for (const mat of this.scenery.houseWindowMats) {
      mat.emissiveIntensity = nightEmissive * 0.9;
    }
    this.scenery.feedTruck.headlightMat.emissiveIntensity = nightEmissive;

    // Smooth weather state blends
    const isRaining = state.weather === 'Hujan Deras';
    const isHot = state.weather === 'Panas Terik';
    this.rainBlend = THREE.MathUtils.damp(this.rainBlend, isRaining ? 1 : 0, 2.8, dt);
    this.heatBlend = THREE.MathUtils.damp(this.heatBlend, isHot ? 1 : 0, 2.5, dt);

    // Wet glossy surfaces during rain, parched matte paths during intense sun
    this.scenery.pathMat.roughness = THREE.MathUtils.lerp(0.86, 0.32, this.rainBlend);
    this.scenery.groundMat.roughness = THREE.MathUtils.lerp(0.92, 0.6, this.rainBlend);

    const branchPonds = state.ponds.filter((p) => p.branchId === state.activeBranch);

    // --- Particle Weather 1: Rain Streaks & Surface Splash Ripples ('Hujan Deras') ---
    if (this.rainBlend > 0.015) {
      this.rainLines.visible = true;
      this.rainLineMat.opacity = 0.62 * this.rainBlend;
      const posAttr = this.rainLines.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < RAIN_COUNT; i++) {
        const dIdx = i * 4;
        const spd = this.rainDrops[dIdx + 3];
        this.rainDrops[dIdx] -= dt * 3.1;
        this.rainDrops[dIdx + 1] -= dt * spd;
        const rx = this.rainDrops[dIdx];
        const ry = this.rainDrops[dIdx + 1];
        const rz = this.rainDrops[dIdx + 2];
        const targetY = this.getRainImpactSurfaceY(rx, rz, branchPonds);
        if (ry <= targetY) {
          if (Math.random() < 0.32 * this.rainBlend) {
            this.spawnRainSplash(rx, targetY + 0.015, rz);
          }
          this.rainDrops[dIdx] = (Math.random() - 0.5) * 62;
          this.rainDrops[dIdx + 1] = 21 + Math.random() * 5;
          this.rainDrops[dIdx + 2] = (Math.random() - 0.5) * 58 + 3;
        }
        this.syncRainStreakVertex(i);
      }
      posAttr.needsUpdate = true;
    } else {
      this.rainLines.visible = false;
    }

    // Update expanding rain splash rings
    let activeSplashes = 0;
    for (let s = 0; s < MAX_RAIN_SPLASHES; s++) {
      const sIdx = s * 4;
      const age = this.rainSplashData[sIdx + 3];
      if (age > 0) {
        this.rainSplashData[sIdx + 3] = Math.max(0, age - dt * 2.3);
        const progress = 1 - this.rainSplashData[sIdx + 3];
        _dummySplash.rotation.set(0, 0, 0);
        _dummySplash.position.set(
          this.rainSplashData[sIdx],
          this.rainSplashData[sIdx + 1],
          this.rainSplashData[sIdx + 2]
        );
        _dummySplash.scale.setScalar(0.55 + progress * 2.4);
        _dummySplash.updateMatrix();
        this.rainSplashesMesh.setMatrixAt(s, _dummySplash.matrix);
        activeSplashes++;
      } else {
        _dummySplash.position.set(0, -15, 0);
        _dummySplash.scale.setScalar(0.001);
        _dummySplash.updateMatrix();
        this.rainSplashesMesh.setMatrixAt(s, _dummySplash.matrix);
      }
    }
    if (activeSplashes > 0) {
      this.rainSplashesMesh.visible = true;
      this.rainSplashMat.opacity = 0.65 * Math.max(0.25, this.rainBlend);
      this.rainSplashesMesh.instanceMatrix.needsUpdate = true;
    } else {
      this.rainSplashesMesh.visible = false;
    }

    // --- Particle Weather 2: Heat Shimmer Convection & Thermal Mirage ('Panas Terik') ---
    const activeHeatIntensity = this.heatBlend * clamp((atmo.daylight - 0.15) / 0.85, 0.18, 1);
    if (activeHeatIntensity > 0.015) {
      this.heatShimmerPoints.visible = true;
      this.heatHazeMesh.visible = true;
      this.heatShimmerMat.uniforms.uTime.value = this.elapsed;
      this.heatShimmerMat.uniforms.uIntensity.value = activeHeatIntensity;
      this.heatHazeMat.uniforms.uTime.value = this.elapsed;
      this.heatHazeMat.uniforms.uIntensity.value = activeHeatIntensity;

      const shimmerAttr = this.heatShimmerPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < HEAT_SHIMMER_COUNT; i++) {
        const pIdx = i * 3;
        const sIdx = i * 4;
        const bx = this.heatShimmerSeeds[sIdx];
        const bz = this.heatShimmerSeeds[sIdx + 1];
        const phase = this.heatShimmerSeeds[sIdx + 2];
        const spd = this.heatShimmerSeeds[sIdx + 3];

        let py = this.heatShimmerPos[pIdx + 1] + dt * spd * 1.15;
        if (py > 4.5) py = 0.05;
        this.heatShimmerPos[pIdx] = bx + Math.sin(this.elapsed * 2.8 + phase + py * 1.5) * 0.28;
        this.heatShimmerPos[pIdx + 1] = py;
        this.heatShimmerPos[pIdx + 2] = bz + Math.cos(this.elapsed * 2.3 + phase + py * 1.2) * 0.22;
      }
      shimmerAttr.needsUpdate = true;
    } else {
      this.heatShimmerPoints.visible = false;
      this.heatHazeMesh.visible = false;
    }

    // Biome tint & reflective river sun/water update per active branch + weather wave scale
    const bSpec = BRANCH_SPECS[state.activeBranch];
    this.scenery.groundMat.color.setHex(bSpec.biomeGroundHex).multiplyScalar(isHot ? 1.44 : 1.38);

    const riverUniforms = this.scenery.riverWater.material.uniforms;
    riverUniforms['sunDirection'].value.copy(atmo.sunDirection);
    riverUniforms['sunColor'].value.copy(atmo.sunColor);
    riverUniforms['waterColor'].value.setHex(bSpec.biomeRiverHex).multiplyScalar(isRaining ? 0.44 : 0.55);
    const targetDistortion =
      state.weather === 'Angin Kencang'
        ? 3.4
        : isRaining
        ? 3.0
        : isHot
        ? 1.15
        : 1.75;
    riverUniforms['distortionScale'].value = THREE.MathUtils.damp(
      riverUniforms['distortionScale'].value,
      targetDistortion,
      3.0,
      dt
    );
    riverUniforms['size'].value = THREE.MathUtils.damp(
      riverUniforms['size'].value,
      isRaining || state.weather === 'Angin Kencang' ? 3.6 : isHot ? 2.1 : 2.6,
      3.0,
      dt
    );

    return { daylight: atmo.daylight };
  }

  /**
   * Village Atmosphere: dynamic wind direction swaying trees & shoreline reeds,
   * animated feed transport truck on the village road, sampan river boat, and flowing ripples.
   */
  private updateVillageAtmosphere(dt: number, speedMult: number, state: GameState): void {
    const animMult = speedMult === 0 ? 0.35 : Math.min(speedMult, 2.5);
    const animDt = dt * animMult;

    // Smoothly shifting wind direction & weather-driven intensity
    this.windAngle = 0.35 + Math.sin(this.elapsed * 0.06) * 0.65;
    const windCos = Math.cos(this.windAngle);
    const windSin = Math.sin(this.windAngle);
    const windStrength =
      state.weather === 'Angin Kencang'
        ? 0.095
        : state.weather === 'Hujan Deras'
        ? 0.05
        : state.weather === 'Mendung'
        ? 0.025
        : 0.016;
    const windFreq = state.weather === 'Angin Kencang' ? 3.4 : state.weather === 'Hujan Deras' ? 2.2 : 1.35;

    // Directional wind sway across perimeter trees
    const trees = this.scenery.treesGroup.children;
    for (let idx = 0; idx < trees.length; idx++) {
      const tree = trees[idx];
      const gust = Math.sin(this.elapsed * windFreq + idx * 0.9) * windStrength + windStrength * 0.28;
      tree.rotation.z = -windCos * gust;
      tree.rotation.x = windSin * gust * 0.85;
    }

    // Wind shader update on shoreline reeds
    this.scenery.reedMat.userData.uTime.value = this.elapsed;
    this.scenery.reedMat.userData.uWind.value = 0.04 + windStrength * 1.4;

    // Feed transport vehicle driving along village road (z = 13.0) & pausing near Silo/Kiosk
    const truck = this.scenery.feedTruck;
    if (truck.pauseTimer > 0) {
      truck.pauseTimer -= animDt;
    } else {
      const truckSpeed = 3.2;
      const moveX = truck.dir * truckSpeed * animDt;
      truck.posX += moveX;
      for (let w = 0; w < truck.wheels.length; w++) {
        truck.wheels[w].rotation.y -= (moveX / 0.3) * truck.dir;
      }
      if (truck.dir > 0 && truck.posX >= 15.2) {
        truck.posX = 15.2;
        truck.dir = -1;
        truck.pauseTimer = 2.6;
      } else if (truck.dir < 0 && truck.posX <= -17.5) {
        truck.posX = -17.5;
        truck.dir = 1;
        truck.pauseTimer = 1.8;
      }
      truck.group.position.x = truck.posX;
      truck.group.rotation.y = truck.dir >= 0 ? 0 : Math.PI;
    }

    // River sampan boat gliding smoothly back and forth
    const boatPhase = this.elapsed * 0.13;
    this.scenery.boatGroup.position.x = Math.sin(boatPhase) * 21;
    this.scenery.boatGroup.position.y = 0.18 + Math.sin(this.elapsed * 2.2) * 0.03;
    this.scenery.boatGroup.rotation.y = Math.cos(boatPhase) >= 0 ? 0 : Math.PI;
    this.scenery.boatGroup.rotation.z = Math.sin(this.elapsed * 1.7) * 0.03;

    // Floating riverbank Teratai & Eceng Gondok gentle bobbing
    const riverVegs = this.scenery.riverVegGroup.children;
    for (let i = 0; i < riverVegs.length; i++) {
      const veg = riverVegs[i];
      const phase = (veg.userData.phase as number) || i;
      veg.position.y = 0.055 + Math.sin(this.elapsed * 1.65 + phase) * 0.014;
      veg.rotation.x = Math.sin(this.elapsed * 1.2 + phase) * 0.035;
      veg.rotation.z = Math.cos(this.elapsed * 1.4 + phase) * 0.035;
    }

    // Planar reflective river & pond normal/water ripple scroll across all pond surface types
    this.scenery.riverWater.material.uniforms['time'].value += animDt * 0.65;
    this.textures.waterKonvensional.offset.x = (this.elapsed * 0.03) % 1;
    this.textures.waterKonvensional.offset.y = (this.elapsed * 0.015) % 1;
    this.textures.waterBioflok.offset.x = (this.elapsed * -0.022) % 1;
    this.textures.waterBioflok.offset.y = (this.elapsed * 0.026) % 1;
    this.textures.waterRas.offset.x = (this.elapsed * 0.038) % 1;
    this.textures.waterRas.offset.y = (this.elapsed * -0.018) % 1;
    this.textures.waterNormals.offset.x = (this.elapsed * 0.042) % 1;
    this.textures.waterNormals.offset.y = (this.elapsed * -0.022) % 1;
  }

  private updateNpcs(dt: number, speedMult: number, state: GameState, isTitleScreen: boolean): void {
    const moveDt = dt * (speedMult === 0 ? 0.25 : Math.min(speedMult, 2));
    for (const npc of this.npcs) {
      npc.speechTimer -= dt;
      if (npc.speechTimer <= 0) {
        npc.currentLineIndex = (npc.currentLineIndex + 1) % npc.speechLines.length;
        npc.speechTimer = 6.5 + Math.random() * 4.5;
        this.npcActiveLines[npc.id] = pickContextualSpeech(npc, state.weather);
      }

      if (npc.pauseTimer > 0) {
        npc.pauseTimer -= moveDt;
        npc.leftLeg.rotation.x = 0;
        npc.rightLeg.rotation.x = 0;
        continue;
      }
      const target = npc.waypoints[npc.currentIdx];
      _npcDir.subVectors(target, npc.group.position);
      const dist = _npcDir.length();
      if (dist < 0.22) {
        npc.currentIdx = (npc.currentIdx + 1) % npc.waypoints.length;
        npc.pauseTimer = 1.2 + Math.random() * 1.8;
      } else {
        _npcDir.normalize();
        npc.group.position.addScaledVector(_npcDir, npc.speed * moveDt);
        npc.group.rotation.y = Math.atan2(_npcDir.x, _npcDir.z);
        const swing = Math.sin(this.elapsed * 6.5) * 0.45;
        npc.leftLeg.rotation.x = swing;
        npc.rightLeg.rotation.x = -swing;
      }
    }

    if (this.hooks.onUpdateNpcBubbles) {
      this.npcBubbleEmitTimer += dt;
      if (this.npcBubbleEmitTimer >= 0.075) {
        this.npcBubbleEmitTimer = 0;
        if (isTitleScreen) {
          this.hooks.onUpdateNpcBubbles([]);
          return;
        }
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || window.innerHeight;
        const bubbles: ProjectedNpcBubble[] = [];

        for (const npc of this.npcs) {
          const camDist = this.engine.camera.position.distanceTo(npc.group.position);
          if (camDist > 40) continue;

          _projVec.set(npc.group.position.x, 2.05, npc.group.position.z);
          _projVec.project(this.engine.camera);

          if (_projVec.z < 1 && _projVec.z > -1) {
            const sx = (_projVec.x * 0.5 + 0.5) * width;
            const sy = (-_projVec.y * 0.5 + 0.5) * height;
            const visible = sx > 65 && sx < width - 65 && sy > 78 && sy < height - 110;
            if (visible) {
              bubbles.push({
                id: npc.id,
                name: npc.name,
                role: npc.role,
                text: this.npcActiveLines[npc.id] ?? npc.speechLines[0],
                x: Math.round(sx),
                y: Math.round(sy),
                visible: true,
              });
            }
          }
        }
        this.hooks.onUpdateNpcBubbles(bubbles);
      }
    }
  }

  /**
   * Renders distinct high-fidelity visual representations for Konvensional, Bioflok, and RAS
   * pond types, driving MeshPhysicalMaterial environmental reflections, weather-reactive water shaders,
   * and PBR pond structure coatings.
   */
  private syncPondVisualsAndUpgrades(
    handle: PondVisualHandle,
    pond: PondState | undefined,
    selected: boolean,
    state: GameState,
    daylight: number
  ): void {
    handle.syncFromState(pond, selected);
    if (!pond || !pond.unlocked) return;

    const envMap = this.engine.scene.environment;
    const isRaining = state.weather === 'Hujan Deras';
    const isSunny = state.weather === 'Panas Terik';

    // Keep all pond structure MeshPhysicalMaterials synchronized with sky PMREM IBL & wet-weather sheen
    for (let m = 0; m < handle.structureMaterials.length; m++) {
      const mat = handle.structureMaterials[m];
      if (mat.userData.baseClearcoat === undefined) {
        mat.userData.baseClearcoat = mat.clearcoat;
        mat.userData.baseClearcoatRoughness = mat.clearcoatRoughness;
        mat.userData.baseEnvMapIntensity = mat.envMapIntensity;
      }
      if (mat.envMap !== envMap) {
        mat.envMap = envMap;
      }
      const baseClearcoat = mat.userData.baseClearcoat as number;
      const baseClearcoatRough = mat.userData.baseClearcoatRoughness as number;
      const baseEnvIntensity = mat.userData.baseEnvMapIntensity as number;

      if (this.rainBlend > 0.05) {
        mat.clearcoat = Math.min(1.0, baseClearcoat + 0.42 * this.rainBlend);
        mat.clearcoatRoughness = Math.max(0.05, baseClearcoatRough * (1 - 0.55 * this.rainBlend));
        mat.envMapIntensity = baseEnvIntensity * (mat.metalness > 0.5 ? 1.25 : 1.18);
      } else {
        mat.clearcoat = baseClearcoat;
        mat.clearcoatRoughness = baseClearcoatRough;
        mat.envMapIntensity = baseEnvIntensity * (isSunny ? 1.14 : 1.0);
      }
    }

    if (!pond.built || pond.pondType === 'kios') return;

    const waterMat = handle.waterMat;
    if (waterMat.normalMap !== this.textures.waterNormals) {
      waterMat.normalMap = this.textures.waterNormals;
      waterMat.needsUpdate = true;
    }
    const targetWaterTex =
      pond.pondType === 'bioflok'
        ? this.textures.waterBioflok
        : pond.pondType === 'ras'
        ? this.textures.waterRas
        : this.textures.waterKonvensional;
    if (waterMat.map !== targetWaterTex) {
      waterMat.map = targetWaterTex;
      waterMat.needsUpdate = true;
    }
    if (waterMat.envMap !== envMap) {
      waterMat.envMap = envMap;
    }
    waterMat.ior = 1.333;

    // Drive weather shader uniforms on each pond's physical water surface
    waterMat.userData.uRainIntensity.value = this.rainBlend;
    waterMat.userData.uHeatIntensity.value = this.heatBlend * clamp((daylight - 0.1) / 0.9, 0.2, 1);

    const windWaveBoost =
      state.weather === 'Angin Kencang' ? 0.36 : this.rainBlend * 0.28 - this.heatBlend * 0.08;
    const aeroScale =
      (pond.upgrades.aerator > 0 ? 0.22 + pond.upgrades.aerator * 0.08 : 0) + windWaveBoost;

    if (pond.pondType === 'bioflok') {
      handle.waterMesh.scale.set(0.84, 0.96, 1);
      handle.waterMesh.position.y = 0.9;
      _pondWaterWork.setHex(0x8a6c40);
      if (pond.upgrades.filter >= 2) {
        _pondWaterWork.lerp(_pondBioflokClear, 0.35);
      }
      waterMat.color.copy(_pondWaterWork);
      waterMat.opacity = 0.85;
      waterMat.roughness = clamp(0.22 - this.heatBlend * 0.05 + this.rainBlend * 0.06, 0.08, 0.4);
      waterMat.clearcoat = 0.78;
      waterMat.clearcoatRoughness = 0.14;
      waterMat.reflectivity = 0.72;
      waterMat.specularIntensity = 0.82;
      waterMat.sheen = 0.24;
      waterMat.sheenRoughness = 0.5;
      waterMat.iridescence = 0.08;
      waterMat.envMapIntensity = isRaining ? 1.15 : isSunny ? 1.25 : 1.05;
      waterMat.normalScale.set(Math.max(0.2, 0.68 + aeroScale), Math.max(0.2, 0.68 + aeroScale));
    } else if (pond.pondType === 'ras') {
      handle.waterMesh.scale.set(0.98, 0.98, 1);
      handle.waterMesh.position.y = 0.82;
      waterMat.color.setHex(pond.upgrades.filter >= 2 ? 0x38bdf8 : 0x0ea5e9);
      waterMat.opacity = 0.68;
      waterMat.roughness = clamp(0.06 - this.heatBlend * 0.02 + this.rainBlend * 0.06, 0.03, 0.2);
      waterMat.clearcoat = 1.0;
      waterMat.clearcoatRoughness = 0.04;
      waterMat.reflectivity = 0.96;
      waterMat.specularIntensity = 1.0;
      waterMat.sheen = 0.0;
      waterMat.iridescence = 0.16 + this.heatBlend * 0.1;
      waterMat.envMapIntensity = isRaining ? 1.38 : isSunny ? 1.62 : 1.48;
      waterMat.normalScale.set(Math.max(0.18, 0.38 + aeroScale * 0.75), Math.max(0.18, 0.38 + aeroScale * 0.75));
    } else {
      handle.waterMesh.scale.set(0.95, 0.95, 1);
      handle.waterMesh.position.y = 0.68;
      const ammT = clamp(pond.water.ammoniaPpm / 0.6, 0, 1);
      _pondWaterWork.setHex(0x2289a8).lerp(_pondDirtyTint, ammT * 0.78);
      waterMat.color.copy(_pondWaterWork);
      waterMat.opacity = 0.76;
      waterMat.roughness = clamp(0.13 + ammT * 0.08 - this.heatBlend * 0.04 + this.rainBlend * 0.06, 0.05, 0.35);
      waterMat.clearcoat = 0.92;
      waterMat.clearcoatRoughness = 0.08 + ammT * 0.05;
      waterMat.reflectivity = 0.88;
      waterMat.specularIntensity = 0.92;
      waterMat.sheen = ammT * 0.18;
      waterMat.iridescence = 0.1 + this.heatBlend * 0.08;
      waterMat.envMapIntensity = isRaining ? 1.24 : isSunny ? 1.45 : 1.28;
      waterMat.normalScale.set(Math.max(0.2, 0.55 + aeroScale), Math.max(0.2, 0.55 + aeroScale));
    }
  }

  private syncSceneWithState(state: GameState, selectedSlot: number | null, daylight: number): void {
    if (this.lastBranchId !== state.activeBranch) {
      this.lastBranchId = state.activeBranch;
      this.rainSplashData.fill(0);
    }

    const branchPonds = state.ponds.filter((p) => p.branchId === state.activeBranch);
    for (let i = 0; i < this.pondHandles.length; i++) {
      const pond = branchPonds[i];
      this.syncPondVisualsAndUpgrades(
        this.pondHandles[i],
        pond,
        Boolean(pond && selectedSlot === i),
        state,
        daylight
      );
    }

    const branchKiosks = state.kioskPlots.filter((k) => k.branchId === state.activeBranch);
    for (let i = 0; i < this.kioskHandles.length; i++) {
      this.kioskHandles[i].syncFromState(branchKiosks[i]);
    }

    this.buildingsHandle.syncFromInfra(state.infra);
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const rawDt = Math.min((now - this.lastTimestamp) / 1000, 0.05);
      this.lastTimestamp = now;

      if (!document.hidden) {
        this.elapsed += rawDt;
        this.hooks.onTickFrame(rawDt);

        const { gameState, selectedSlot, speed, isTitleScreen } = this.hooks.getLatestState();

        if (isTitleScreen) {
          const panAngle = this.elapsed * 0.12;
          this.engine.camera.position.set(Math.sin(panAngle) * 24, 14.5, Math.cos(panAngle) * 24);
          this.controls.target.set(-0.5, 1.0, 1.0);
          this.controls.update();
        } else if (this.cameraTransitionActive) {
          this.engine.camera.position.x = THREE.MathUtils.damp(this.engine.camera.position.x, _camPosGoal.x, 5.5, rawDt);
          this.engine.camera.position.y = THREE.MathUtils.damp(this.engine.camera.position.y, _camPosGoal.y, 5.5, rawDt);
          this.engine.camera.position.z = THREE.MathUtils.damp(this.engine.camera.position.z, _camPosGoal.z, 5.5, rawDt);
          this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, _camTargetGoal.x, 5.5, rawDt);
          this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, _camTargetGoal.y, 5.5, rawDt);
          this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, _camTargetGoal.z, 5.5, rawDt);
          this.controls.update();
          if (this.engine.camera.position.distanceTo(_camPosGoal) < 0.12) {
            this.cameraTransitionActive = false;
          }
        } else {
          this.controls.update();
        }

        const { daylight } = this.updateDayNightAndWeather(gameState, rawDt);
        this.syncSceneWithState(gameState, selectedSlot, daylight);
        this.updateVillageAtmosphere(rawDt, speed, gameState);
        this.updateNpcs(rawDt, speed, gameState, isTitleScreen);
        this.updateSpatialAudio(rawDt, gameState, daylight, isTitleScreen);

        const branchPonds = gameState.ponds.filter((p) => p.branchId === gameState.activeBranch);
        for (let i = 0; i < this.pondHandles.length; i++) {
          this.pondHandles[i].animate(this.elapsed, rawDt, branchPonds[i], speed, gameState.dayProgress);
        }
      } else {
        // Ensure audio fades cleanly if tab is hidden
        if (this.audioGraph) {
          this.audioGraph.masterGain.gain.setTargetAtTime(0, this.audioGraph.ctx.currentTime, 0.05);
        }
      }

      this.engine.render();

      if (this.engine.isSoftwareGl) {
        this.engine.afterDraw(
          tick,
          () => this.disposed,
          (id) => {
            this.frameId = id;
          }
        );
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.engine.isSoftwareGl) {
      this.engine.afterDraw(
        tick,
        () => this.disposed,
        (id) => {
          this.frameId = id;
        }
      );
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onUserAudioGesture);
    window.removeEventListener('pointerdown', this.onUserAudioGesture);
    const dom = this.engine.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointerup', this.onPointerUp);

    if (this.audioGraph) {
      try {
        this.audioGraph.windSource.stop();
        this.audioGraph.waterSource.stop();
        this.audioGraph.rainSource.stop();
        this.audioGraph.villageSource.stop();
        this.audioGraph.truckOsc.stop();
        this.audioGraph.masterGain.disconnect();
      } catch {
        // Ignore nodes already stopped
      }
      this.audioGraph = null;
    }

    this.controls.dispose();
    this.textures.disposeAll();
    const speciesGeos = Object.values(this.fishGeometries);
    for (let i = 0; i < speciesGeos.length; i++) {
      speciesGeos[i].dispose();
    }
    disposeObject3D(this.engine.scene, false);
    this.engine.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
