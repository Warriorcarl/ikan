import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { clamp } from '../game/formulas';
import { WeatherType } from '../game/types';

export interface AtmosphereUpdateResult {
  sunDirection: THREE.Vector3;
  sunColor: THREE.Color;
  daylight: number;
  isDawnOrDusk: boolean;
}

const _sunDir = new THREE.Vector3();
const _sunColor = new THREE.Color();
const _sunDayColor = new THREE.Color(0xfff7ea);
const _sunHotColor = new THREE.Color(0xffe7ab);
const _sunDawnColor = new THREE.Color(0xff9952);
const _sunOvercastColor = new THREE.Color(0xdbeafe);
const _hemiSkyDay = new THREE.Color(0xc2e9ff);
const _hemiSkyDawn = new THREE.Color(0xfbbf90);
const _hemiSkyNight = new THREE.Color(0x1e3557);
const _hemiSkyRain = new THREE.Color(0x64748b);
const _hemiGroundDay = new THREE.Color(0x435e36);
const _hemiGroundNight = new THREE.Color(0x132018);
const _fogDay = new THREE.Color(0x9bd2ea);
const _fogDawn = new THREE.Color(0xe69f6c);
const _fogNight = new THREE.Color(0x0b1526);
const _fogRain = new THREE.Color(0x4b5c6b);
const _fogHot = new THREE.Color(0xf3d49f);
const _fogWork = new THREE.Color();
const _rimDayColor = new THREE.Color(0x93c5fd);
const _rimDawnColor = new THREE.Color(0xfdba74);
const _rimNightColor = new THREE.Color(0x3b6399);

/**
 * Photorealistic HDR Rendering Engine for Tirta Saga 3D.
 * Combines ACES/AgX HDR tone mapping, Sky atmospheric scattering + volumetric FBM clouds,
 * dynamic Sky-to-PMREM Image-Based Lighting (IBL), 3-point outdoor sunlight + soft shadows,
 * Ground-Truth Ambient Occlusion (GTAO), selective HDR Bloom, and FXAA on GPU,
 * while automatically keeping software WebGL responsive and visually consistent.
 */
export class RealisticRenderEngine {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly isSoftwareGl: boolean;

  public readonly sky: Sky;
  public readonly sunLight: THREE.DirectionalLight;
  public readonly rimLight: THREE.DirectionalLight;
  public readonly hemiLight: THREE.HemisphereLight;
  public readonly nightLampLight: THREE.PointLight;

  private composer: EffectComposer | null = null;
  private gtaoPass: GTAOPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private fxaaPass: ShaderPass | null = null;

  private pmremGenerator: THREE.PMREMGenerator;
  private iblScene: THREE.Scene;
  private iblSky: Sky;
  private iblGroundBounce: THREE.Mesh;
  private currentEnvTarget: THREE.WebGLRenderTarget | null = null;
  private lastIblBucket = -999;

  private starsPoints: THREE.Points;
  private starsMat: THREE.PointsMaterial;
  private moonMesh: THREE.Mesh;
  private moonMat: THREE.MeshBasicMaterial;

  private disposed = false;

  constructor(container: HTMLElement) {
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const pixelRatio = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2);

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.isSoftwareGl ? false : true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9bd2ea);
    this.scene.fog = new THREE.FogExp2(0x9bd2ea, 0.0085);

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.5, 420);
    this.camera.position.set(0, 19.5, 28);

    // Physical Atmospheric Sky Dome with Built-in Volumetric FBM Clouds
    this.sky = new Sky();
    this.sky.scale.setScalar(2000);
    const skyU = this.sky.material.uniforms;
    skyU['turbidity'].value = 3.2;
    skyU['rayleigh'].value = 1.65;
    skyU['mieCoefficient'].value = 0.0045;
    skyU['mieDirectionalG'].value = 0.82;
    skyU['cloudScale'].value = 0.00024;
    skyU['cloudSpeed'].value = 0.00003;
    skyU['cloudCoverage'].value = 0.42;
    skyU['cloudDensity'].value = 0.46;
    skyU['cloudElevation'].value = 0.52;
    skyU['showSunDisc'].value = 1;
    this.scene.add(this.sky);

    // Night Starfield Dome & Moon Disc
    const starCount = 420;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.12 + Math.random() * 0.88);
      const r = 175;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.starsMat = new THREE.PointsMaterial({
      color: 0xe2e8f0,
      size: 0.72,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    });
    this.starsPoints = new THREE.Points(starGeo, this.starsMat);
    this.scene.add(this.starsPoints);

    this.moonMat = new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0,
      fog: false,
    });
    this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), this.moonMat);
    this.scene.add(this.moonMesh);

    // Dynamic PMREM Environment Probe Scene (Sky + Warm Ground Bounce + Studio Fill)
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.iblScene = new THREE.Scene();
    this.iblSky = new Sky();
    this.iblSky.scale.setScalar(200);
    this.iblSky.material.uniforms['showSunDisc'].value = 0;
    this.iblScene.add(this.iblSky);
    this.iblGroundBounce = new THREE.Mesh(
      new THREE.CircleGeometry(140, 24),
      new THREE.MeshBasicMaterial({ color: 0x3b5933 })
    );
    this.iblGroundBounce.rotation.x = -Math.PI / 2;
    this.iblGroundBounce.position.y = -4;
    this.iblScene.add(this.iblGroundBounce);

    // Warm/Cool 3-Point Outdoor Lighting Rig
    this.hemiLight = new THREE.HemisphereLight(0xc2e9ff, 0x435e36, 0.75);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff4e0, 2.05);
    this.sunLight.position.set(18, 28, 16);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 96;
    const d = 31;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.00045;
    this.sunLight.shadow.normalBias = 0.02;
    this.sunLight.shadow.radius = 2.4;
    this.scene.add(this.sunLight);

    // Cool opposite sky rim light for sculptural silhouettes
    this.rimLight = new THREE.DirectionalLight(0x93c5fd, 0.38);
    this.rimLight.position.set(-22, 14, -20);
    this.scene.add(this.rimLight);

    // Warm night courtyard lantern fill
    this.nightLampLight = new THREE.PointLight(0xffb74d, 0, 38, 1.35);
    this.nightLampLight.position.set(0, 6.8, 3);
    this.scene.add(this.nightLampLight);

    // Seed initial Studio/Sky Environment IBL
    const roomTarget = this.pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    this.currentEnvTarget = roomTarget;
    this.scene.environment = roomTarget.texture;
    this.scene.environmentIntensity = 0.85;

    // HDR Post-Processing Composer on GPU
    if (!this.isSoftwareGl) {
      const hdrTarget = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType,
      });
      this.composer = new EffectComposer(this.renderer, hdrTarget);
      this.composer.setPixelRatio(pixelRatio);
      this.composer.setSize(w, h);

      const renderPass = new RenderPass(this.scene, this.camera);
      this.composer.addPass(renderPass);

      this.gtaoPass = new GTAOPass(this.scene, this.camera, w, h);
      this.gtaoPass.output = GTAOPass.OUTPUT.Default;
      this.gtaoPass.blendIntensity = 0.54;
      this.gtaoPass.updateGtaoMaterial({
        radius: 0.72,
        distanceExponent: 1.65,
        thickness: 0.88,
        distanceFallOff: 0.9,
        scale: 1.0,
        samples: 12,
      });
      this.composer.addPass(this.gtaoPass);

      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2))),
        0.18,
        0.38,
        0.96
      );
      this.composer.addPass(this.bloomPass);

      const outputPass = new OutputPass();
      this.composer.addPass(outputPass);

      this.fxaaPass = new ShaderPass(FXAAShader);
      this.fxaaPass.material.uniforms['resolution'].value.set(
        1 / (w * pixelRatio),
        1 / (h * pixelRatio)
      );
      this.composer.addPass(this.fxaaPass);
    }
  }

  public precompile(): void {
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  public resize(w: number, h: number): void {
    if (this.disposed) return;
    const width = Math.max(1, w);
    const height = Math.max(1, h);
    const pixelRatio = this.renderer.getPixelRatio();

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);

    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(Math.floor(width / 2), Math.floor(height / 2));
    }
    if (this.fxaaPass) {
      this.fxaaPass.material.uniforms['resolution'].value.set(
        1 / (width * pixelRatio),
        1 / (height * pixelRatio)
      );
    }
  }

  public updateAtmosphere(
    dayProgress: number,
    weather: WeatherType,
    elapsed: number,
    dt = 0.016
  ): AtmosphereUpdateResult {
    const sunAngle = (dayProgress - 0.25) * Math.PI * 2;
    const sinA = Math.sin(sunAngle);
    const cosA = Math.cos(sunAngle);

    // Sun direction vector for Sky dome & Water shader
    _sunDir.set(cosA * 0.85, sinA, 0.36).normalize();
    this.sky.material.uniforms['sunPosition'].value.copy(_sunDir);
    this.sky.material.uniforms['time'].value = elapsed * 0.45;

    // Position directional shadow light smoothly above horizon
    this.sunLight.position.set(cosA * 34, Math.max(4.5, sinA * 34), 16);

    // Smooth continuous daylight & golden-hour bell curve (zero hard discontinuities)
    const rawDay = clamp((sinA + 0.18) / 1.18, 0, 1);
    const daylight = rawDay * rawDay * (3 - 2 * rawDay);
    const twilightBell = clamp(1 - Math.abs(sinA - 0.08) / 0.36, 0, 1);
    const twilightWeight = twilightBell * twilightBell * (3 - 2 * twilightBell);
    const isDawnOrDusk = twilightWeight > 0.35;

    // Target atmospheric scattering & cloud configuration per weather (damped smoothly)
    const skyU = this.sky.material.uniforms;
    let targetTurbidity = 3.2;
    let targetRayleigh = 1.65;
    let targetMie = 0.0045;
    let targetCloudCov = 0.42;
    let targetCloudDens = 0.46;
    let targetCloudSpd = 0.00003;
    let targetFogDensity = 0.0078;
    let targetExposure = 1.06;
    let weatherSunMult = 1.0;

    if (weather === 'Hujan Deras') {
      targetTurbidity = 11.5;
      targetRayleigh = 0.65;
      targetMie = 0.018;
      targetCloudCov = 0.86;
      targetCloudDens = 0.78;
      targetCloudSpd = 0.000055;
      targetFogDensity = 0.0145;
      targetExposure = 0.97;
      weatherSunMult = 0.42;
    } else if (weather === 'Mendung') {
      targetTurbidity = 8.0;
      targetRayleigh = 0.95;
      targetMie = 0.011;
      targetCloudCov = 0.72;
      targetCloudDens = 0.62;
      targetCloudSpd = 0.000035;
      targetFogDensity = 0.01;
      targetExposure = 1.02;
      weatherSunMult = 0.68;
    } else if (weather === 'Panas Terik') {
      targetTurbidity = 2.4;
      targetRayleigh = 1.9;
      targetMie = 0.003;
      targetCloudCov = 0.16;
      targetCloudDens = 0.28;
      targetCloudSpd = 0.00002;
      targetFogDensity = 0.0094;
      targetExposure = 1.13;
      weatherSunMult = 1.28;
    } else if (weather === 'Angin Kencang') {
      targetTurbidity = 4.6;
      targetRayleigh = 1.45;
      targetMie = 0.006;
      targetCloudCov = 0.56;
      targetCloudDens = 0.5;
      targetCloudSpd = 0.00009;
      targetFogDensity = 0.0085;
      targetExposure = 1.05;
      weatherSunMult = 0.96;
    }

    const dampK = 2.4;
    skyU['turbidity'].value = THREE.MathUtils.damp(skyU['turbidity'].value, targetTurbidity, dampK, dt);
    skyU['rayleigh'].value = THREE.MathUtils.damp(skyU['rayleigh'].value, targetRayleigh, dampK, dt);
    skyU['mieCoefficient'].value = THREE.MathUtils.damp(skyU['mieCoefficient'].value, targetMie, dampK, dt);
    skyU['cloudCoverage'].value = THREE.MathUtils.damp(skyU['cloudCoverage'].value, targetCloudCov, dampK, dt);
    skyU['cloudDensity'].value = THREE.MathUtils.damp(skyU['cloudDensity'].value, targetCloudDens, dampK, dt);
    skyU['cloudSpeed'].value = THREE.MathUtils.damp(skyU['cloudSpeed'].value, targetCloudSpd, dampK, dt);

    // Horizon Fog matching continuous day-night & weather mood
    if (weather === 'Hujan Deras' || weather === 'Mendung') {
      _fogWork.copy(_fogDay).lerp(_fogRain, weather === 'Hujan Deras' ? 0.82 : 0.48);
    } else if (weather === 'Panas Terik') {
      _fogWork.copy(_fogDay).lerp(_fogHot, 0.36 * daylight);
    } else {
      _fogWork.copy(_fogDay);
    }
    _fogWork.lerp(_fogDawn, twilightWeight * 0.54);
    _fogWork.lerp(_fogNight, 1 - daylight);

    (this.scene.background as THREE.Color).lerp(_fogWork, Math.min(1, dt * 4.0 + 0.15));
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.scene.background as THREE.Color);
      this.scene.fog.density = THREE.MathUtils.damp(
        this.scene.fog.density,
        targetFogDensity + (1 - daylight) * 0.0022,
        dampK,
        dt
      );
    }

    this.renderer.toneMappingExposure = THREE.MathUtils.damp(
      this.renderer.toneMappingExposure,
      targetExposure - (1 - daylight) * 0.05,
      dampK,
      dt
    );

    // Smooth sun, hemisphere & rim color gradients across dawn -> noon -> dusk -> night
    _sunColor.copy(weather === 'Panas Terik' ? _sunHotColor : _sunDayColor);
    if (weather === 'Hujan Deras' || weather === 'Mendung') {
      _sunColor.lerp(_sunOvercastColor, weather === 'Hujan Deras' ? 0.65 : 0.35);
    }
    _sunColor.lerp(_sunDawnColor, twilightWeight * 0.82);
    this.sunLight.color.copy(_sunColor);
    this.sunLight.intensity = THREE.MathUtils.damp(
      this.sunLight.intensity,
      (0.22 + daylight * 1.88) * weatherSunMult,
      4.0,
      dt
    );

    // Hemisphere Sky & Ground Bounce smooth shift
    this.hemiLight.color.copy(_hemiSkyDay);
    if (weather === 'Hujan Deras' || weather === 'Mendung') {
      this.hemiLight.color.lerp(_hemiSkyRain, weather === 'Hujan Deras' ? 0.72 : 0.4);
    }
    this.hemiLight.color.lerp(_hemiSkyDawn, twilightWeight * 0.58);
    this.hemiLight.color.lerp(_hemiSkyNight, 1 - daylight);
    this.hemiLight.groundColor.copy(_hemiGroundDay).lerp(_hemiGroundNight, 1 - daylight);
    this.hemiLight.intensity = THREE.MathUtils.damp(this.hemiLight.intensity, 0.28 + daylight * 0.56, 4.0, dt);

    // Rim Light & Courtyard Lantern smooth shift
    this.rimLight.color.copy(_rimDayColor).lerp(_rimDawnColor, twilightWeight * 0.65).lerp(_rimNightColor, 1 - daylight);
    this.rimLight.intensity = THREE.MathUtils.damp(this.rimLight.intensity, 0.16 + daylight * 0.32, 4.0, dt);
    this.nightLampLight.intensity = THREE.MathUtils.damp(this.nightLampLight.intensity, (1 - daylight) * 2.65, 4.0, dt);

    // Night stars & moon visibility
    const nightAlpha = clamp((0.36 - daylight) / 0.36, 0, 1);
    this.starsMat.opacity = nightAlpha * (weather === 'Hujan Deras' ? 0.08 : 0.85);
    this.starsPoints.visible = this.starsMat.opacity > 0.02;
    this.moonMesh.position.set(-cosA * 115, Math.max(18, -sinA * 115), -45);
    this.moonMat.opacity = nightAlpha * (weather === 'Hujan Deras' ? 0.18 : 0.92);
    this.moonMesh.visible = this.moonMat.opacity > 0.03;

    // Update Sky-derived PMREM environment probe smoothly on significant daylight/weather shifts
    const weatherCode =
      weather === 'Hujan Deras' ? 10 : weather === 'Mendung' ? 20 : weather === 'Panas Terik' ? 30 : 0;
    const iblBucket = Math.round(daylight * 8) + weatherCode;
    if (iblBucket !== this.lastIblBucket && daylight > 0.14) {
      this.lastIblBucket = iblBucket;
      const iblU = this.iblSky.material.uniforms;
      iblU['turbidity'].value = skyU['turbidity'].value;
      iblU['rayleigh'].value = skyU['rayleigh'].value;
      iblU['mieCoefficient'].value = skyU['mieCoefficient'].value;
      iblU['sunPosition'].value.copy(_sunDir);
      iblU['cloudCoverage'].value = 0;

      const nextEnv = this.pmremGenerator.fromScene(this.iblScene, 0.04);
      const prevEnv = this.currentEnvTarget;
      this.currentEnvTarget = nextEnv;
      this.scene.environment = nextEnv.texture;
      if (prevEnv) prevEnv.dispose();
    }
    this.scene.environmentIntensity = THREE.MathUtils.damp(
      this.scene.environmentIntensity,
      daylight <= 0.14 ? 0.28 + daylight * 1.2 : 0.42 + daylight * 0.56,
      4.0,
      dt
    );

    return {
      sunDirection: _sunDir,
      sunColor: _sunColor,
      daylight,
      isDawnOrDusk,
    };
  }

  public render(): void {
    if (this.disposed) return;
    if (!this.isSoftwareGl && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public afterDraw(cb: () => void, getDisposed: () => boolean, setFrameId: (id: number) => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (getDisposed() || this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        setFrameId(window.setTimeout(poll, 5));
      } else {
        if (sync) gl.deleteSync(sync);
        setFrameId(window.setTimeout(cb, 80));
      }
    };
    setFrameId(window.setTimeout(poll, 5));
  }

  public dispose(): void {
    this.disposed = true;
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    if (this.gtaoPass) {
      this.gtaoPass.dispose();
      this.gtaoPass = null;
    }
    if (this.bloomPass) {
      this.bloomPass.dispose();
      this.bloomPass = null;
    }
    if (this.currentEnvTarget) {
      this.currentEnvTarget.dispose();
      this.currentEnvTarget = null;
    }
    this.pmremGenerator.dispose();
    this.iblSky.geometry.dispose();
    this.iblSky.material.dispose();
    this.iblGroundBounce.geometry.dispose();
    (this.iblGroundBounce.material as THREE.Material).dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.starsPoints.geometry.dispose();
    this.starsMat.dispose();
    this.moonMesh.geometry.dispose();
    this.moonMat.dispose();
    this.renderer.dispose();
  }
}
