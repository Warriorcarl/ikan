import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Water } from 'three/addons/objects/Water.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { POND_TYPE_SPECS, SPECIES_CATALOG } from '../game/config';
import { clamp } from '../game/formulas';
import {
  InfraLevels,
  KioskPlotState,
  PondState,
  SpeciesId,
  WeatherType,
} from '../game/types';
import { ProceduralTextures } from './textures';

THREE.Cache.enabled = true;

export type OptionalGlbAssetKey =
  | 'pondKonvensional'
  | 'pondBioflok'
  | 'pondRas'
  | 'kioskPlot'
  | 'tree'
  | 'villageHouse'
  | 'feedTruck'
  | 'fishLele'
  | 'fishNila'
  | 'fishGurame'
  | 'fishPatin'
  | 'fishKoi';

/**
 * Optional external .glb URL overrides. Leave empty ('') to use the built-in
 * procedural 3D models with zero network requests or 404 errors.
 */
export const OPTIONAL_GLB_ASSETS: Partial<Record<OptionalGlbAssetKey, string>> = {};

export interface OptionalGlbLoadOptions {
  targetHeight?: number;
  targetFootprint?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

const sharedGltfLoader = new GLTFLoader();

export function disposeObject3D(root: THREE.Object3D, disposeTextures = false): void {
  root.traverse((obj) => {
    if (
      obj instanceof THREE.Mesh ||
      obj instanceof THREE.Points ||
      obj instanceof THREE.LineSegments ||
      obj instanceof THREE.InstancedMesh
    ) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (let i = 0; i < mats.length; i++) {
        const mat = mats[i];
        if (!mat) continue;
        if (disposeTextures) {
          const rec = mat as unknown as Record<string, unknown>;
          for (const key of Object.keys(rec)) {
            const val = rec[key];
            if (val instanceof THREE.Texture) {
              val.dispose();
            }
          }
        }
        mat.dispose();
      }
    }
  });
}

function normalizeLoadedGlb(
  gltfRoot: THREE.Group,
  options: OptionalGlbLoadOptions = {}
): THREE.Group {
  const { targetHeight, targetFootprint, castShadow = true, receiveShadow = true } = options;
  gltfRoot.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = castShadow;
      child.receiveShadow = receiveShadow;
    }
  });

  if (targetHeight || targetFootprint) {
    const box = new THREE.Box3().setFromObject(gltfRoot);
    const size = box.getSize(new THREE.Vector3());
    let scale = 1;
    if (targetHeight && size.y > 0.001) {
      scale = targetHeight / size.y;
    } else if (targetFootprint && Math.max(size.x, size.z) > 0.001) {
      scale = targetFootprint / Math.max(size.x, size.z);
    }
    gltfRoot.scale.multiplyScalar(scale);
    gltfRoot.updateMatrixWorld(true);
    const scaledBox = new THREE.Box3().setFromObject(gltfRoot);
    gltfRoot.position.y -= scaledBox.min.y;
  }

  return gltfRoot;
}

/**
 * Loads an optional .glb model if a non-empty URL is provided, automatically falling
 * back to the procedural THREE.Group factory when URL is empty or loading fails.
 */
export async function loadOptionalGlbWithFallback(
  url: string | undefined | null,
  createFallback: () => THREE.Group,
  options?: OptionalGlbLoadOptions
): Promise<THREE.Group> {
  if (!url || !url.trim()) {
    return createFallback();
  }
  try {
    const gltf = await sharedGltfLoader.loadAsync(url);
    return normalizeLoadedGlb(gltf.scene, options);
  } catch {
    return createFallback();
  }
}

/**
 * Attaches an optional .glb override onto a container slot that renders `proceduralGroup`
 * immediately; if `url` is supplied and loads cleanly, swaps it in seamlessly.
 */
export function attachOptionalGlbOverride(
  slotContainer: THREE.Group,
  proceduralGroup: THREE.Group,
  url: string | undefined | null,
  options?: OptionalGlbLoadOptions
): void {
  if (!url || !url.trim()) return;
  void sharedGltfLoader
    .loadAsync(url)
    .then((gltf) => {
      if (!slotContainer.parent) return;
      const model = normalizeLoadedGlb(gltf.scene, options);
      proceduralGroup.visible = false;
      slotContainer.add(model);
    })
    .catch(() => {
      // Keep proceduralGroup visible seamlessly
    });
}

// 12 well-spaced pond coordinates supporting 4, 6, 9, and 12 plots per branch
export const POND_SLOTS_POS: Array<[number, number]> = [
  [-11.0, -9.0],
  [-4.0, -9.0],
  [3.0, -9.0],
  [10.0, -9.0],
  [-11.0, -1.8],
  [-4.0, -1.8],
  [3.0, -1.8],
  [10.0, -1.8],
  [-11.0, 5.4],
  [-4.0, 5.4],
  [3.0, 5.4],
  [10.0, 5.4],
];

// 5 Kiosk roadside plaza coordinates supporting 2, 3, 4, and 5 kiosk plots per branch
export const KIOSK_SLOTS_POS: Array<[number, number]> = [
  [-12.0, 10.6],
  [-6.2, 10.6],
  [-0.4, 10.6],
  [5.4, 10.6],
  [11.2, 10.6],
];

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export function createContactShadowPlane(
  tex: THREE.CanvasTexture,
  w: number,
  d: number,
  opacity = 0.42
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, d);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.015;
  return m;
}

export type SpeciesFishGeometries = Record<SpeciesId, THREE.BufferGeometry>;

function normalizeAndMergeParts(
  parts: THREE.BufferGeometry[],
  fallbackFactory: () => THREE.BufferGeometry
): THREE.BufferGeometry {
  const nonIndexed: THREE.BufferGeometry[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const g = p.index ? p.toNonIndexed() : p.clone();
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    nonIndexed.push(g);
    p.dispose();
  }
  const merged = mergeGeometries(nonIndexed, false);
  for (let i = 0; i < nonIndexed.length; i++) {
    nonIndexed[i].dispose();
  }
  if (!merged) {
    return fallbackFactory();
  }
  merged.computeVertexNormals();
  return merged;
}

function makeExtrudedFin(pts: Array<[number, number]>, thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i][0], pts[i][1]);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness * 0.5);
  return geo;
}

export function createSpeciesFishGeometries(): SpeciesFishGeometries {
  const fallback = () => {
    const g = new THREE.SphereGeometry(0.16, 10, 8);
    g.scale(1.65, 0.72, 0.56);
    return g;
  };

  // 1. Lele (Clarias catfish): elongated rounded body, wide flat head, front whisker barbels, continuous dorsal ridge
  const leleBody = new THREE.SphereGeometry(0.14, 10, 8);
  leleBody.scale(2.15, 0.54, 0.56);
  const leleHead = new THREE.SphereGeometry(0.115, 9, 7);
  leleHead.scale(1.05, 0.52, 0.84);
  leleHead.translate(0.18, -0.01, 0);
  const leleTail = makeExtrudedFin(
    [
      [-0.25, 0],
      [-0.41, 0.085],
      [-0.38, 0],
      [-0.41, -0.085],
    ],
    0.014
  );
  const leleDorsal = makeExtrudedFin(
    [
      [-0.22, 0.05],
      [0.08, 0.06],
      [-0.02, 0.13],
      [-0.24, 0.1],
    ],
    0.012
  );
  const barbelL = new THREE.CylinderGeometry(0.007, 0.003, 0.14, 5);
  barbelL.rotateZ(-Math.PI * 0.34);
  barbelL.rotateY(0.35);
  barbelL.translate(0.32, -0.03, 0.075);
  const barbelR = new THREE.CylinderGeometry(0.007, 0.003, 0.14, 5);
  barbelR.rotateZ(-Math.PI * 0.34);
  barbelR.rotateY(-0.35);
  barbelR.translate(0.32, -0.03, -0.075);
  const lele = normalizeAndMergeParts(
    [leleBody, leleHead, leleTail, leleDorsal, barbelL, barbelR],
    fallback
  );

  // 2. Nila Merah (Red Tilapia): deep laterally-compressed oval perch + spiny dorsal + fan tail + pectoral fins
  const nilaBody = new THREE.SphereGeometry(0.165, 11, 8);
  nilaBody.scale(1.52, 0.88, 0.44);
  const nilaTail = makeExtrudedFin(
    [
      [-0.2, 0],
      [-0.36, 0.13],
      [-0.33, 0],
      [-0.36, -0.13],
    ],
    0.016
  );
  const nilaDorsal = makeExtrudedFin(
    [
      [-0.12, 0.11],
      [0.1, 0.11],
      [0.02, 0.22],
      [-0.11, 0.19],
    ],
    0.014
  );
  const nilaPecL = makeExtrudedFin(
    [
      [0.06, -0.02],
      [-0.04, -0.09],
      [-0.06, -0.02],
    ],
    0.01
  );
  nilaPecL.rotateY(0.38);
  nilaPecL.translate(0.03, 0, 0.068);
  const nilaPecR = makeExtrudedFin(
    [
      [0.06, -0.02],
      [-0.04, -0.09],
      [-0.06, -0.02],
    ],
    0.01
  );
  nilaPecR.rotateY(-0.38);
  nilaPecR.translate(0.03, 0, -0.068);
  const nila = normalizeAndMergeParts(
    [nilaBody, nilaTail, nilaDorsal, nilaPecL, nilaPecR],
    fallback
  );

  // 3. Gurame (Giant Gourami): tall diamond/disc profile, rear rounded dorsal, long pelvic feelers
  const gurBody = new THREE.SphereGeometry(0.18, 11, 8);
  gurBody.scale(1.42, 1.04, 0.42);
  const gurTail = makeExtrudedFin(
    [
      [-0.2, 0],
      [-0.36, 0.14],
      [-0.37, 0],
      [-0.36, -0.14],
    ],
    0.016
  );
  const gurDorsal = makeExtrudedFin(
    [
      [-0.16, 0.13],
      [0.04, 0.15],
      [-0.08, 0.26],
      [-0.18, 0.21],
    ],
    0.014
  );
  const gurAnal = makeExtrudedFin(
    [
      [-0.16, -0.13],
      [0.03, -0.14],
      [-0.08, -0.22],
    ],
    0.012
  );
  const feelerL = new THREE.CylinderGeometry(0.005, 0.002, 0.18, 4);
  feelerL.rotateZ(Math.PI * 0.32);
  feelerL.translate(-0.02, -0.17, 0.03);
  const feelerR = new THREE.CylinderGeometry(0.005, 0.002, 0.18, 4);
  feelerR.rotateZ(Math.PI * 0.32);
  feelerR.translate(-0.02, -0.17, -0.03);
  const gurame = normalizeAndMergeParts(
    [gurBody, gurTail, gurDorsal, gurAnal, feelerL, feelerR],
    fallback
  );

  // 4. Patin (Iridescent Shark Catfish): sleek hydrodynamic torpedo + high shark dorsal + swept forked tail
  const patBody = new THREE.SphereGeometry(0.15, 11, 8);
  patBody.scale(2.05, 0.66, 0.5);
  const patTail = makeExtrudedFin(
    [
      [-0.26, 0],
      [-0.44, 0.15],
      [-0.35, 0],
      [-0.44, -0.15],
    ],
    0.015
  );
  const patDorsal = makeExtrudedFin(
    [
      [0.0, 0.07],
      [0.11, 0.08],
      [0.02, 0.24],
    ],
    0.014
  );
  const patPecL = makeExtrudedFin(
    [
      [0.12, -0.02],
      [-0.02, -0.1],
      [-0.02, -0.02],
    ],
    0.01
  );
  patPecL.rotateY(0.42);
  patPecL.translate(0.04, 0, 0.065);
  const patPecR = makeExtrudedFin(
    [
      [0.12, -0.02],
      [-0.02, -0.1],
      [-0.02, -0.02],
    ],
    0.01
  );
  patPecR.rotateY(-0.42);
  patPecR.translate(0.04, 0, -0.065);
  const patin = normalizeAndMergeParts(
    [patBody, patTail, patDorsal, patPecL, patPecR],
    fallback
  );

  // 5. Koi (Ornamental Carp): full rounded fuselage + flowing veil tail + flared pectoral fins
  const koiBody = new THREE.SphereGeometry(0.165, 11, 8);
  koiBody.scale(1.82, 0.72, 0.58);
  const koiTail = makeExtrudedFin(
    [
      [-0.24, 0],
      [-0.44, 0.16],
      [-0.37, 0],
      [-0.44, -0.16],
    ],
    0.014
  );
  const koiDorsal = makeExtrudedFin(
    [
      [-0.14, 0.09],
      [0.08, 0.1],
      [0.01, 0.2],
      [-0.13, 0.17],
    ],
    0.012
  );
  const koiPecL = makeExtrudedFin(
    [
      [0.08, -0.03],
      [-0.05, -0.13],
      [-0.08, -0.04],
    ],
    0.01
  );
  koiPecL.rotateY(0.45);
  koiPecL.translate(0.03, 0, 0.075);
  const koiPecR = makeExtrudedFin(
    [
      [0.08, -0.03],
      [-0.05, -0.13],
      [-0.08, -0.04],
    ],
    0.01
  );
  koiPecR.rotateY(-0.45);
  koiPecR.translate(0.03, 0, -0.075);
  const koi = normalizeAndMergeParts(
    [koiBody, koiTail, koiDorsal, koiPecL, koiPecR],
    fallback
  );

  return { lele, nila, gurame, patin, koi };
}

export function createCompositeFishGeometry(): THREE.BufferGeometry {
  const specs = createSpeciesFishGeometries();
  specs.lele.dispose();
  specs.gurame.dispose();
  specs.patin.dispose();
  specs.koi.dispose();
  return specs.nila;
}

/**
 * Generates an organically craggy, flat-bottomed natural stone geometry.
 */
function createOrganicRockGeometry(seed: number, radius: number, detail = 1): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const len = Math.hypot(x, y, z) || 1;
    const nx = x / len;
    const ny = y / len;
    const nz = z / len;
    const n1 = Math.sin(nx * 3.7 + seed * 1.9) * Math.cos(nz * 3.1 - seed * 0.7);
    const n2 = Math.sin((ny + nx) * 5.3 + seed * 2.3);
    const disp = 1 + n1 * 0.22 + n2 * 0.11;
    x *= disp;
    z *= disp * (1 + Math.cos(seed * 1.3) * 0.12);
    y *= disp * 0.68;
    const minBottom = -radius * 0.32;
    if (y < minBottom) y = minBottom;
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a notched floating Teratai (water lily) pad geometry lying flat on XZ.
 */
function createLotusPadGeometry(radius: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const notch = 0.26;
  const steps = 22;
  shape.moveTo(0, 0);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = notch + t * (Math.PI * 2 - notch * 2);
    const wave = 1 + 0.045 * Math.sin(ang * 6);
    shape.lineTo(Math.cos(ang) * radius * wave, Math.sin(ang) * radius * wave);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.014,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function createLotusPetalGeometry(length: number, width: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(width * 0.65, length * 0.45, 0, length);
  shape.quadraticCurveTo(-width * 0.65, length * 0.45, 0, 0);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.008,
    bevelEnabled: false,
  });
  return geo;
}

function createHyacinthLeafGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.085, 0.09, 0.068, 0.19);
  shape.quadraticCurveTo(0, 0.25, -0.068, 0.19);
  shape.quadraticCurveTo(-0.085, 0.09, 0, 0);
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.009,
    bevelEnabled: false,
  });
}

interface AquaticPlantMaterials {
  padMat: THREE.MeshPhysicalMaterial;
  padDarkMat: THREE.MeshPhysicalMaterial;
  petalPinkMat: THREE.MeshPhysicalMaterial;
  petalCreamMat: THREE.MeshPhysicalMaterial;
  stamenMat: THREE.MeshStandardMaterial;
  bulbMat: THREE.MeshPhysicalMaterial;
  leafMat: THREE.MeshPhysicalMaterial;
  flowerVioletMat: THREE.MeshPhysicalMaterial;
  rootMat: THREE.MeshStandardMaterial;
}

interface AquaticSharedGeometries {
  padLarge: THREE.BufferGeometry;
  padSmall: THREE.BufferGeometry;
  petalOuter: THREE.BufferGeometry;
  petalInner: THREE.BufferGeometry;
  stamenGeo: THREE.BufferGeometry;
  budGeo: THREE.BufferGeometry;
  bulbGeo: THREE.BufferGeometry;
  hyacinthLeafGeo: THREE.BufferGeometry;
  stalkGeo: THREE.BufferGeometry;
  floretGeo: THREE.BufferGeometry;
  rootTuftGeo: THREE.BufferGeometry;
}

function createAquaticSharedGeometries(): AquaticSharedGeometries {
  const bulbGeo = new THREE.SphereGeometry(0.048, 8, 7);
  bulbGeo.scale(0.95, 1.35, 0.95);
  const rootTuftGeo = new THREE.ConeGeometry(0.11, 0.22, 7);
  rootTuftGeo.rotateX(Math.PI);
  return {
    padLarge: createLotusPadGeometry(0.24),
    padSmall: createLotusPadGeometry(0.17),
    petalOuter: createLotusPetalGeometry(0.115, 0.055),
    petalInner: createLotusPetalGeometry(0.088, 0.045),
    stamenGeo: new THREE.SphereGeometry(0.026, 7, 6),
    budGeo: new THREE.ConeGeometry(0.028, 0.085, 7),
    bulbGeo,
    hyacinthLeafGeo: createHyacinthLeafGeometry(),
    stalkGeo: new THREE.CylinderGeometry(0.011, 0.014, 0.22, 6),
    floretGeo: new THREE.SphereGeometry(0.022, 6, 5),
    rootTuftGeo,
  };
}

function buildLotusFlowerGroup(
  mats: AquaticPlantMaterials,
  geos: AquaticSharedGeometries,
  pinkPrimary: boolean
): THREE.Group {
  const flower = new THREE.Group();
  const outerMat = pinkPrimary ? mats.petalPinkMat : mats.petalCreamMat;
  const innerMat = pinkPrimary ? mats.petalCreamMat : mats.petalPinkMat;
  for (let p = 0; p < 7; p++) {
    const ang = (p / 7) * Math.PI * 2;
    const holder = new THREE.Group();
    holder.rotation.y = ang;
    const petal = new THREE.Mesh(geos.petalOuter, outerMat);
    petal.rotation.x = 0.85;
    holder.add(petal);
    flower.add(holder);
  }
  for (let p = 0; p < 5; p++) {
    const ang = ((p + 0.4) / 5) * Math.PI * 2;
    const holder = new THREE.Group();
    holder.rotation.y = ang;
    const petal = new THREE.Mesh(geos.petalInner, innerMat);
    petal.rotation.x = 0.42;
    holder.add(petal);
    flower.add(holder);
  }
  const core = new THREE.Mesh(geos.stamenGeo, mats.stamenMat);
  core.scale.set(1, 0.65, 1);
  core.position.y = 0.026;
  flower.add(core);
  return flower;
}

function buildEcengRosetteGroup(
  mats: AquaticPlantMaterials,
  geos: AquaticSharedGeometries,
  withFlower: boolean
): THREE.Group {
  const rosette = new THREE.Group();
  for (let b = 0; b < 5; b++) {
    const ang = (b / 5) * Math.PI * 2 + 0.25;
    const bulb = new THREE.Mesh(geos.bulbGeo, mats.bulbMat);
    bulb.position.set(Math.cos(ang) * 0.055, 0.02, Math.sin(ang) * 0.055);
    rosette.add(bulb);

    const leafHolder = new THREE.Group();
    leafHolder.position.set(Math.cos(ang) * 0.058, 0.042, Math.sin(ang) * 0.058);
    leafHolder.rotation.y = -ang + Math.PI / 2;
    const leaf = new THREE.Mesh(geos.hyacinthLeafGeo, mats.leafMat);
    leaf.rotation.x = 0.45 + (b % 2) * 0.2;
    leafHolder.add(leaf);
    rosette.add(leafHolder);
  }
  const roots = new THREE.Mesh(geos.rootTuftGeo, mats.rootMat);
  roots.position.y = -0.095;
  rosette.add(roots);

  if (withFlower) {
    const stalk = new THREE.Mesh(geos.stalkGeo, mats.bulbMat);
    stalk.position.y = 0.12;
    rosette.add(stalk);
    for (let f = 0; f < 4; f++) {
      const a = (f / 4) * Math.PI * 2;
      const floret = new THREE.Mesh(geos.floretGeo, mats.flowerVioletMat);
      floret.position.set(Math.cos(a) * 0.024, 0.2 + (f % 2) * 0.03, Math.sin(a) * 0.024);
      rosette.add(floret);
    }
    const eye = new THREE.Mesh(geos.stamenGeo, mats.stamenMat);
    eye.scale.setScalar(0.5);
    eye.position.y = 0.22;
    rosette.add(eye);
  }
  return rosette;
}

function createAquaticVegetationCluster(
  kind: 'teratai' | 'eceng' | 'mixed',
  mats: AquaticPlantMaterials,
  geos: AquaticSharedGeometries,
  seed: number
): THREE.Group {
  const cluster = new THREE.Group();
  if (kind === 'teratai' || kind === 'mixed') {
    const pad1 = new THREE.Mesh(geos.padLarge, mats.padMat);
    pad1.position.set(0, 0.008, 0);
    pad1.rotation.y = seed * 1.1;
    cluster.add(pad1);

    const pad2 = new THREE.Mesh(geos.padSmall, mats.padDarkMat);
    pad2.position.set(0.24, 0.01, -0.14);
    pad2.rotation.y = seed * 1.7 + 1.8;
    cluster.add(pad2);

    const pad3 = new THREE.Mesh(geos.padSmall, mats.padMat);
    pad3.position.set(-0.21, 0.009, 0.16);
    pad3.rotation.y = seed * 2.1 + 3.4;
    cluster.add(pad3);

    const flower = buildLotusFlowerGroup(mats, geos, seed % 2 === 0);
    flower.position.set(0.05, 0.022, 0.03);
    cluster.add(flower);

    const bud = new THREE.Mesh(geos.budGeo, mats.petalPinkMat);
    bud.position.set(-0.18, 0.045, 0.13);
    bud.rotation.z = 0.18;
    cluster.add(bud);
  }

  if (kind === 'eceng') {
    const r1 = buildEcengRosetteGroup(mats, geos, true);
    r1.position.set(0, 0, 0);
    const r2 = buildEcengRosetteGroup(mats, geos, false);
    r2.scale.setScalar(0.84);
    r2.position.set(0.18, 0, 0.12);
    r2.rotation.y = 1.1;
    const r3 = buildEcengRosetteGroup(mats, geos, true);
    r3.scale.setScalar(0.92);
    r3.position.set(-0.16, 0, 0.14);
    r3.rotation.y = 2.4;
    cluster.add(r1, r2, r3);
  } else if (kind === 'mixed') {
    const r = buildEcengRosetteGroup(mats, geos, true);
    r.scale.setScalar(0.88);
    r.position.set(0.22, 0, 0.18);
    r.rotation.y = seed * 0.9;
    cluster.add(r);
  }

  return cluster;
}

export interface PondVisualHandle {
  slotIndex: number;
  root: THREE.Group;
  hitBox: THREE.Mesh;
  lockedPlotGroup: THREE.Group;
  emptyPlotGroup: THREE.Group;
  slotKioskGroup: THREE.Group;
  slotKioskPatio: THREE.Group;
  slotKioskRoof: THREE.Group;
  slotKioskSolar: THREE.Group;
  slotKioskLanternMat: THREE.MeshStandardMaterial;
  konvensionalGroup: THREE.Group;
  bioflokGroup: THREE.Group;
  rasGroup: THREE.Group;
  edgeRocksGroup: THREE.Group;
  aquaticVegGroup: THREE.Group;
  waterMesh: THREE.Mesh;
  waterMat: THREE.MeshPhysicalMaterial;
  structureMaterials: THREE.MeshPhysicalMaterial[];
  bubbleMesh: THREE.InstancedMesh;
  canopyGroup: THREE.Group;
  canopyTiers: THREE.Group[];
  aeratorGroup: THREE.Group;
  aeratorRotors: THREE.Object3D[];
  aeratorLv2Parts: THREE.Group;
  aeratorLv3Parts: THREE.Group;
  aeratorLv4Parts: THREE.Group;
  aeratorLv5Parts: THREE.Group;
  autoFeederGroup: THREE.Group;
  autoFeederArm: THREE.Object3D;
  autoFeederLv2Parts: THREE.Group;
  autoFeederLv3Parts: THREE.Group;
  autoFeederLv4Parts: THREE.Group;
  iotGroup: THREE.Group;
  iotLedMat: THREE.MeshStandardMaterial;
  iotLv2Parts: THREE.Group;
  iotLv3Parts: THREE.Group;
  iotLv4Parts: THREE.Group;
  filterGroup: THREE.Group;
  filterLv2Parts: THREE.Group;
  filterLv3Parts: THREE.Group;
  filterLv4Parts: THREE.Group;
  filterLv5Parts: THREE.Group;
  gradingGroup: THREE.Group;
  gradingLv2Bar: THREE.Mesh;
  gradingLv3Parts: THREE.Group;
  gradingLv4Parts: THREE.Group;
  futuristicGroup: THREE.Group;
  holoRing: THREE.Mesh;
  futuristicLv2Parts: THREE.Group;
  futuristicLv3Parts: THREE.Group;
  fishMesh: THREE.InstancedMesh;
  fishMat: THREE.MeshStandardMaterial;
  fishPhases: Float32Array;
  pelletMesh: THREE.InstancedMesh;
  splashRingMesh: THREE.InstancedMesh;
  selectionRing: THREE.Mesh;
  feedBurstState: { timer: number; lastSeenStamp: number };
  syncFromState: (pond: PondState | undefined, selected: boolean) => void;
  animate: (
    elapsed: number,
    dt: number,
    pond: PondState | undefined,
    speedMult: number,
    dayProgress?: number
  ) => void;
}

const MAX_VISUAL_FISH = 40;
const MAX_BUBBLES = 26;
const MAX_PELLETS = 24;
const MAX_SPLASH_RINGS = 12;

export function createPondAssembly(
  slotIndex: number,
  x: number,
  z: number,
  textures: ProceduralTextures,
  fishGeometryOrMap: THREE.BufferGeometry | SpeciesFishGeometries
): PondVisualHandle {
  const fishGeometries: SpeciesFishGeometries | null =
    fishGeometryOrMap instanceof THREE.BufferGeometry ? null : fishGeometryOrMap;
  const initialFishGeo: THREE.BufferGeometry =
    fishGeometryOrMap instanceof THREE.BufferGeometry ? fishGeometryOrMap : fishGeometryOrMap.nila;

  const root = new THREE.Group();
  root.position.set(x, 0, z);

  // Selection highlight ring
  const selGeo = new THREE.RingGeometry(2.95, 3.22, 40);
  const selMat = new THREE.MeshBasicMaterial({
    color: 0x34d399,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });
  const selectionRing = new THREE.Mesh(selGeo, selMat);
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.y = 0.04;
  selectionRing.visible = false;
  root.add(selectionRing);

  // Layer 1 Hitbox for fast raycasting
  const hitGeo = new THREE.BoxGeometry(5.5, 2.2, 5.0);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitBox = new THREE.Mesh(hitGeo, hitMat);
  hitBox.position.y = 1.0;
  hitBox.layers.set(1);
  hitBox.userData = { pondSlot: slotIndex };
  root.add(hitBox);

  // --- 0A. Locked Plot Barricade (Unlocks at higher player levels) ---
  const lockedPlotGroup = new THREE.Group();
  const lockPad = new THREE.Mesh(
    new THREE.BoxGeometry(5.1, 0.06, 4.5),
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.95 })
  );
  lockPad.position.y = 0.03;
  lockPad.receiveShadow = true;
  lockedPlotGroup.add(lockPad);
  const stakeMat = new THREE.MeshStandardMaterial({
    map: textures.wood,
    normalMap: textures.woodNormal,
    roughness: 0.85,
  });
  const cautionMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5 });
  const cautionYellowMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 });
  const barX1 = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.12, 0.08), cautionYellowMat);
  barX1.position.set(0, 0.55, 0);
  barX1.rotation.y = 0.65;
  const barX2 = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.12, 0.08), cautionMat);
  barX2.position.set(0, 0.55, 0);
  barX2.rotation.y = -0.65;
  const lockPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.05, 8), stakeMat);
  lockPost.position.set(0, 0.52, 0);
  const lockSign = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.5, 0.1), cautionMat);
  lockSign.position.set(0, 0.92, 0);
  lockedPlotGroup.add(barX1, barX2, lockPost, lockSign);
  root.add(lockedPlotGroup);

  // --- 0B. Empty Plot Marker ---
  const emptyPlotGroup = new THREE.Group();
  const padMat = new THREE.MeshStandardMaterial({ color: 0x8b7e66, roughness: 0.94 });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.07, 4.5), padMat);
  pad.position.y = 0.035;
  pad.receiveShadow = true;
  emptyPlotGroup.add(pad);

  const signMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.72 });
  [
    [-2.4, -2.1],
    [2.4, -2.1],
    [-2.4, 2.1],
    [2.4, 2.1],
  ].forEach(([sx, sz]) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.68, 8), stakeMat);
    post.position.set(sx, 0.34, sz);
    post.castShadow = true;
    emptyPlotGroup.add(post);
  });
  const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.85, 8), stakeMat);
  signPost.position.set(0, 0.42, 0);
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.48, 0.08), signMat);
  signBoard.position.set(0, 0.8, 0);
  signBoard.castShadow = true;
  emptyPlotGroup.add(signPost, signBoard);
  root.add(emptyPlotGroup);

  // --- 0C. POND-SLOT LAHAN KIOS NIAGA (Lv.1..5 Commercial Pavilion on Pond Slot) ---
  const slotKioskGroup = new THREE.Group();
  slotKioskGroup.add(createContactShadowPlane(textures.contactShadow, 5.4, 4.8, 0.42));
  const kioskWoodMat = new THREE.MeshPhysicalMaterial({
    map: textures.wood,
    normalMap: textures.woodNormal,
    roughnessMap: textures.woodRoughness,
    roughness: 0.72,
    clearcoat: 0.16,
    clearcoatRoughness: 0.45,
    envMapIntensity: 1.05,
  });
  const kioskConcreteMat = new THREE.MeshPhysicalMaterial({
    map: textures.concrete,
    normalMap: textures.concreteNormal,
    roughnessMap: textures.concreteRoughness,
    roughness: 0.76,
    clearcoat: 0.12,
    clearcoatRoughness: 0.55,
    envMapIntensity: 1.0,
  });
  const kioskRoofMat = new THREE.MeshPhysicalMaterial({
    map: textures.terracottaRoof,
    normalMap: textures.roofNormal,
    roughness: 0.68,
    clearcoat: 0.2,
    clearcoatRoughness: 0.42,
    envMapIntensity: 1.05,
  });
  const kioskGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x7dd3fc,
    roughness: 0.08,
    ior: 1.5,
    reflectivity: 0.9,
    clearcoat: 0.95,
    clearcoatRoughness: 0.06,
    transparent: true,
    opacity: 0.68,
    envMapIntensity: 1.4,
  });

  const kioskPad = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.16, 4.5), kioskConcreteMat);
  kioskPad.position.y = 0.08;
  kioskPad.receiveShadow = true;
  const kioskDeck = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.12, 3.8), kioskWoodMat);
  kioskDeck.position.y = 0.22;
  kioskDeck.receiveShadow = true;
  const kioskBackWall = new THREE.Mesh(
    new THREE.BoxGeometry(3.8, 2.1, 0.22),
    new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.8 })
  );
  kioskBackWall.position.set(0, 1.3, -1.25);
  kioskBackWall.castShadow = true;
  const kioskCounter = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.95, 0.8), kioskWoodMat);
  kioskCounter.position.set(0, 0.72, 0.35);
  kioskCounter.castShadow = true;
  const kioskAquarium = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.62, 0.55), kioskGlassMat);
  kioskAquarium.position.set(-1.05, 1.48, 0.35);
  const kioskAwning = new THREE.Mesh(
    new THREE.BoxGeometry(4.3, 0.14, 2.8),
    new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.52 })
  );
  kioskAwning.position.set(0, 2.48, 0.05);
  kioskAwning.rotation.x = 0.14;
  kioskAwning.castShadow = true;
  [
    [-1.95, -1.3],
    [1.95, -1.3],
    [-1.95, 1.25],
    [1.95, 1.25],
  ].forEach(([px, pz]) => {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 2.35, 8), kioskWoodMat);
    pillar.position.set(px, 1.35, pz);
    pillar.castShadow = true;
    slotKioskGroup.add(pillar);
  });

  const slotKioskLanternMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.2,
  });
  const lanternL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), slotKioskLanternMat);
  lanternL.position.set(-1.75, 2.22, 1.28);
  const lanternR = lanternL.clone();
  lanternR.position.set(1.75, 2.22, 1.28);

  // Lv.2+ Outdoor Patio Tables & Benches
  const slotKioskPatio = new THREE.Group();
  [-1.1, 1.1].forEach((tx) => {
    const tbl = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.75), kioskWoodMat);
    tbl.position.set(tx, 0.66, 1.55);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.32, 0.3), kioskWoodMat);
    bench.position.set(tx, 0.35, 1.98);
    slotKioskPatio.add(tbl, bench);
  });

  // Lv.3+ Terracotta Upper Roof
  const slotKioskRoof = new THREE.Group();
  const upperRoof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.1, 4), kioskRoofMat);
  upperRoof.position.set(0, 3.08, -0.15);
  upperRoof.rotation.y = Math.PI / 4;
  upperRoof.castShadow = true;
  slotKioskRoof.add(upperRoof);

  // Lv.4-5 Solar Pergola & Illuminated Signboard
  const slotKioskSolar = new THREE.Group();
  const kioskSolarPanel = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.08, 1.4),
    new THREE.MeshStandardMaterial({ map: textures.solarGrid, roughness: 0.2, metalness: 0.65 })
  );
  kioskSolarPanel.position.set(0, 3.45, 0.35);
  kioskSolarPanel.rotation.x = 0.22;
  const neonBoard = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.42, 0.1), slotKioskLanternMat);
  neonBoard.position.set(0, 2.75, 1.38);
  slotKioskSolar.add(kioskSolarPanel, neonBoard);

  slotKioskGroup.add(
    kioskPad,
    kioskDeck,
    kioskBackWall,
    kioskCounter,
    kioskAquarium,
    kioskAwning,
    lanternL,
    lanternR,
    slotKioskPatio,
    slotKioskRoof,
    slotKioskSolar
  );
  // Decorative awning fascia trim & menu board on slot kiosk
  const kioskFascia = new THREE.Mesh(
    new THREE.BoxGeometry(4.36, 0.14, 0.08),
    kioskWoodMat
  );
  kioskFascia.position.set(0, 2.34, 1.44);
  kioskFascia.castShadow = true;
  const kioskMenuBoard = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.7, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 })
  );
  kioskMenuBoard.position.set(1.0, 1.65, -1.12);
  slotKioskGroup.add(kioskFascia, kioskMenuBoard);
  attachOptionalGlbOverride(slotKioskGroup, slotKioskGroup, OPTIONAL_GLB_ASSETS.kioskPlot, {
    targetFootprint: 5.0,
  });
  root.add(slotKioskGroup);

  // --- 1. REALISTIC KONVENSIONAL / TERPAL POND (PBR MeshPhysicalMaterial) ---
  const konvensionalGroup = new THREE.Group();
  const linerMat = new THREE.MeshPhysicalMaterial({
    map: textures.terpalHdpe,
    normalMap: textures.terpalNormal,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughnessMap: textures.terpalRoughness,
    roughness: 0.42,
    metalness: 0.06,
    clearcoat: 0.48,
    clearcoatRoughness: 0.22,
    ior: 1.48,
    envMapIntensity: 1.2,
  });
  const linerDarkMat = new THREE.MeshPhysicalMaterial({
    map: textures.terpalHdpe,
    normalMap: textures.terpalNormal,
    normalScale: new THREE.Vector2(0.65, 0.65),
    roughnessMap: textures.terpalRoughness,
    color: 0x0b334f,
    roughness: 0.56,
    clearcoat: 0.25,
    envMapIntensity: 0.95,
  });
  const earthMat = new THREE.MeshPhysicalMaterial({
    map: textures.earth,
    normalMap: textures.earthNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: textures.earthRoughness,
    roughness: 0.92,
    clearcoat: 0.04,
    envMapIntensity: 0.85,
  });
  const bambooMat = new THREE.MeshPhysicalMaterial({
    map: textures.bamboo,
    normalMap: textures.bambooNormal,
    normalScale: new THREE.Vector2(0.65, 0.65),
    roughnessMap: textures.woodRoughness,
    roughness: 0.68,
    clearcoat: 0.22,
    clearcoatRoughness: 0.35,
    envMapIntensity: 1.05,
  });
  const pvcMat = new THREE.MeshPhysicalMaterial({
    color: 0xe2e8f0,
    normalMap: textures.pvcNormal,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughnessMap: textures.pvcRoughness,
    roughness: 0.24,
    metalness: 0.08,
    clearcoat: 0.72,
    clearcoatRoughness: 0.14,
    ior: 1.52,
    envMapIntensity: 1.25,
  });

  // Outer sloped earthen embankment walls
  const bermN = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.66, 0.48), earthMat);
  bermN.position.set(0, 0.33, -2.18);
  bermN.castShadow = true;
  bermN.receiveShadow = true;
  const bermS = bermN.clone();
  bermS.position.set(0, 0.33, 2.18);
  const bermW = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.66, 4.84), earthMat);
  bermW.position.set(-2.46, 0.33, 0);
  bermW.castShadow = true;
  bermW.receiveShadow = true;
  const bermE = bermW.clone();
  bermE.position.set(2.46, 0.33, 0);
  konvensionalGroup.add(bermN, bermS, bermW, bermE);

  // Submerged inner HDPE pond floor (visible through semi-transparent water!)
  const konvFloor = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.0), linerDarkMat);
  konvFloor.rotation.x = -Math.PI / 2;
  konvFloor.position.y = 0.14;
  konvFloor.receiveShadow = true;
  konvensionalGroup.add(konvFloor);

  // Inner liner side walls & folded top edge collar
  const lipN = new THREE.Mesh(new THREE.BoxGeometry(5.12, 0.16, 0.32), linerMat);
  lipN.position.set(0, 0.68, -2.15);
  lipN.castShadow = true;
  lipN.receiveShadow = true;
  const lipS = lipN.clone();
  lipS.position.set(0, 0.68, 2.15);
  const lipW = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 4.6), linerMat);
  lipW.position.set(-2.42, 0.68, 0);
  lipW.castShadow = true;
  lipW.receiveShadow = true;
  const lipE = lipW.clone();
  lipE.position.set(2.42, 0.68, 0);
  konvensionalGroup.add(lipN, lipS, lipW, lipE);

  // Bamboo perimeter rail & corner tension stakes + angled anchor pegs
  for (let i = -2; i <= 2; i++) {
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.88, 7), bambooMat);
    p1.position.set(i * 1.15, 0.44, 2.45);
    p1.castShadow = true;
    const p2 = p1.clone();
    p2.position.set(i * 1.15, 0.44, -2.45);
    konvensionalGroup.add(p1, p2);
  }
  [
    [-2.58, -2.32, 0.4],
    [2.58, -2.32, -0.4],
    [-2.58, 2.32, 0.4],
    [2.58, 2.32, -0.4],
  ].forEach(([ax, az, tilt]) => {
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.62, 6), bambooMat);
    peg.position.set(ax, 0.31, az);
    peg.rotation.z = tilt;
    peg.castShadow = true;
    konvensionalGroup.add(peg);
  });
  const railF = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 5.2, 8), bambooMat);
  railF.rotation.z = Math.PI / 2;
  railF.position.set(0, 0.78, 2.45);
  railF.castShadow = true;
  const railB = railF.clone();
  railB.position.set(0, 0.78, -2.45);
  konvensionalGroup.add(railF, railB);

  // PVC Water Inlet Pipe, Elbow Collar, Outlet Drainage Valve Wheel & Timber Feeding Dock with Stringers
  const inletV = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.95, 8), pvcMat);
  inletV.position.set(-2.1, 0.48, -2.25);
  inletV.castShadow = true;
  const inletH = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.55, 8), pvcMat);
  inletH.rotation.x = Math.PI / 2;
  inletH.position.set(-2.1, 0.92, -1.98);
  const inletElbow = new THREE.Mesh(new THREE.SphereGeometry(0.082, 8, 8), pvcMat);
  inletElbow.position.set(-2.1, 0.92, -2.24);
  const outletPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.72, 8), pvcMat);
  outletPipe.rotation.x = Math.PI / 2;
  outletPipe.position.set(2.05, 0.25, 2.38);
  const konvValveMat = new THREE.MeshPhysicalMaterial({
    color: 0xdc2626,
    roughness: 0.3,
    metalness: 0.35,
    clearcoat: 0.6,
    envMapIntensity: 1.2,
  });
  const outletWheel = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 6, 12), konvValveMat);
  outletWheel.position.set(2.05, 0.37, 2.42);
  const deckMat = new THREE.MeshPhysicalMaterial({
    map: textures.wood,
    normalMap: textures.woodNormal,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughnessMap: textures.woodRoughness,
    roughness: 0.74,
    clearcoat: 0.16,
    clearcoatRoughness: 0.42,
    envMapIntensity: 1.05,
  });
  const feedDock = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.85), deckMat);
  feedDock.position.set(0, 0.78, 2.15);
  feedDock.castShadow = true;
  feedDock.receiveShadow = true;
  const dockBeamL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.9), deckMat);
  dockBeamL.position.set(-0.55, 0.7, 2.15);
  const dockBeamR = dockBeamL.clone();
  dockBeamR.position.set(0.55, 0.7, 2.15);
  konvensionalGroup.add(inletV, inletH, inletElbow, outletPipe, outletWheel, feedDock, dockBeamL, dockBeamR);
  attachOptionalGlbOverride(konvensionalGroup, konvensionalGroup, OPTIONAL_GLB_ASSETS.pondKonvensional, {
    targetFootprint: 5.4,
  });
  root.add(konvensionalGroup);

  // --- 2. REALISTIC BIOFLOK CIRCULAR TANK (PBR MeshPhysicalMaterial) ---
  const bioflokGroup = new THREE.Group();
  const wireMeshMat = new THREE.MeshPhysicalMaterial({
    map: textures.galvanizedMesh,
    normalMap: textures.galvanizedNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: textures.galvanizedRoughness,
    roughness: 0.34,
    metalness: 0.72,
    anisotropy: 0.65,
    clearcoat: 0.38,
    clearcoatRoughness: 0.22,
    envMapIntensity: 1.35,
    side: THREE.DoubleSide,
  });
  const wireSteelMat = new THREE.MeshPhysicalMaterial({
    color: 0xdbe4ef,
    normalMap: textures.metalNormal,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughnessMap: textures.metalRoughness,
    roughness: 0.22,
    metalness: 0.92,
    anisotropy: 0.78,
    clearcoat: 0.45,
    clearcoatRoughness: 0.15,
    envMapIntensity: 1.45,
  });
  const bioConcreteMat = new THREE.MeshPhysicalMaterial({
    map: textures.concrete,
    normalMap: textures.concreteNormal,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: textures.concreteRoughness,
    roughness: 0.82,
    clearcoat: 0.12,
    clearcoatRoughness: 0.5,
    envMapIntensity: 1.05,
  });

  // Concrete apron base
  const bioConcrete = new THREE.Mesh(
    new THREE.CylinderGeometry(2.65, 2.75, 0.14, 32),
    bioConcreteMat
  );
  bioConcrete.position.y = 0.07;
  bioConcrete.receiveShadow = true;
  bioflokGroup.add(bioConcrete);

  // Outer wire-mesh + HDPE membrane wall
  const bioWall = new THREE.Mesh(new THREE.CylinderGeometry(2.38, 2.38, 1.05, 32, 1, true), wireMeshMat);
  bioWall.position.y = 0.6;
  bioWall.castShadow = true;
  bioWall.receiveShadow = true;
  bioflokGroup.add(bioWall);

  // Sloped dark inner bottom with central drain cone & collar flange
  const bioBottom = new THREE.Mesh(
    new THREE.CylinderGeometry(2.34, 2.34, 0.06, 28),
    linerDarkMat
  );
  bioBottom.position.y = 0.18;
  bioBottom.receiveShadow = true;
  const centerDrain = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.28, 0.18, 14),
    pvcMat
  );
  centerDrain.position.y = 0.24;
  const drainFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.05, 16), wireSteelMat);
  drainFlange.position.y = 0.2;
  bioflokGroup.add(bioBottom, centerDrain, drainFlange);

  // Top & mid galvanized tension rings + 8 vertical support ribs
  const topRing = new THREE.Mesh(new THREE.TorusGeometry(2.38, 0.075, 10, 32), wireSteelMat);
  topRing.rotation.x = Math.PI / 2;
  topRing.position.y = 1.12;
  topRing.castShadow = true;
  const midRing = new THREE.Mesh(new THREE.TorusGeometry(2.41, 0.038, 8, 32), wireSteelMat);
  midRing.rotation.x = Math.PI / 2;
  midRing.position.y = 0.62;
  bioflokGroup.add(topRing, midRing);

  for (let r = 0; r < 8; r++) {
    const a = (r / 8) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.08, 6), wireSteelMat);
    rib.position.set(Math.cos(a) * 2.42, 0.6, Math.sin(a) * 2.42);
    rib.castShadow = true;
    bioflokGroup.add(rib);
  }

  // Central vortex aeration standpipe + radial air manifold PVC pipes + flange collars + ladder & catwalk
  const vortexPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.96, 10), pvcMat);
  vortexPipe.position.set(0, 0.54, 0);
  const vortexCap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.1, 12), wireSteelMat);
  vortexCap.position.set(0, 1.02, 0);
  const radialAirX = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 4.5, 8), pvcMat);
  radialAirX.rotation.z = Math.PI / 2;
  radialAirX.position.set(0, 1.13, 0);
  const radialAirZ = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 4.5, 8), pvcMat);
  radialAirZ.rotation.x = Math.PI / 2;
  radialAirZ.position.set(0, 1.13, 0);
  const centerHub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 10), pvcMat);
  centerHub.position.set(0, 1.13, 0);
  const airHose = new THREE.Mesh(
    new THREE.TorusGeometry(1.15, 0.035, 8, 24),
    new THREE.MeshPhysicalMaterial({ color: 0x0f172a, roughness: 0.45, clearcoat: 0.3 })
  );
  airHose.rotation.x = Math.PI / 2;
  airHose.position.y = 0.28;
  const bioDeck = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.14, 0.78), deckMat);
  bioDeck.position.set(0, 0.96, 2.48);
  bioDeck.castShadow = true;
  bioDeck.receiveShadow = true;
  const bioStep1 = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.08, 0.32), deckMat);
  bioStep1.position.set(0, 0.36, 2.74);
  const bioStep2 = bioStep1.clone();
  bioStep2.position.set(0, 0.66, 2.66);
  bioflokGroup.add(vortexPipe, vortexCap, radialAirX, radialAirZ, centerHub, airHose, bioDeck, bioStep1, bioStep2);
  attachOptionalGlbOverride(bioflokGroup, bioflokGroup, OPTIONAL_GLB_ASSETS.pondBioflok, {
    targetFootprint: 5.4,
  });
  root.add(bioflokGroup);

  // --- 3. REALISTIC RAS ARCHITECTURAL RACEWAY (PBR MeshPhysicalMaterial) ---
  const rasGroup = new THREE.Group();
  const concreteMat = new THREE.MeshPhysicalMaterial({
    map: textures.concrete,
    normalMap: textures.concreteNormal,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughnessMap: textures.concreteRoughness,
    roughness: 0.64,
    metalness: 0.08,
    clearcoat: 0.22,
    clearcoatRoughness: 0.36,
    envMapIntensity: 1.15,
  });
  const rasFloorMat = new THREE.MeshPhysicalMaterial({
    map: textures.concrete,
    normalMap: textures.concreteNormal,
    roughnessMap: textures.concreteRoughness,
    color: 0x0d5c84,
    roughness: 0.35,
    clearcoat: 0.45,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.2,
  });
  const accentBlueMat = new THREE.MeshPhysicalMaterial({
    color: 0x0284c7,
    roughness: 0.24,
    metalness: 0.45,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.35,
  });
  const pipeMat = new THREE.MeshPhysicalMaterial({
    color: 0xe2e8f0,
    normalMap: textures.metalNormal,
    normalScale: new THREE.Vector2(0.4, 0.4),
    roughnessMap: textures.metalRoughness,
    roughness: 0.18,
    metalness: 0.94,
    anisotropy: 0.82,
    clearcoat: 0.55,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.55,
  });
  const valveRedMat = new THREE.MeshPhysicalMaterial({
    color: 0xdc2626,
    roughness: 0.28,
    metalness: 0.38,
    clearcoat: 0.75,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.3,
  });
  const grateMat = new THREE.MeshPhysicalMaterial({
    map: textures.galvanizedMesh,
    normalMap: textures.galvanizedNormal,
    roughnessMap: textures.galvanizedRoughness,
    roughness: 0.32,
    metalness: 0.82,
    anisotropy: 0.7,
    clearcoat: 0.25,
    envMapIntensity: 1.4,
  });

  const rasBase = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.16, 4.8), concreteMat);
  rasBase.position.y = 0.08;
  rasBase.receiveShadow = true;
  rasGroup.add(rasBase);

  const rasFloor = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.0), rasFloorMat);
  rasFloor.rotation.x = -Math.PI / 2;
  rasFloor.position.y = 0.2;
  rasFloor.receiveShadow = true;
  rasGroup.add(rasFloor);

  const wallN = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.9, 0.28), concreteMat);
  wallN.position.set(0, 0.54, -2.14);
  wallN.castShadow = true;
  wallN.receiveShadow = true;
  const wallS = wallN.clone();
  wallS.position.set(0, 0.54, 2.14);
  const wallW = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.9, 4.56), concreteMat);
  wallW.position.set(-2.52, 0.54, 0);
  wallW.castShadow = true;
  wallW.receiveShadow = true;
  const wallE = wallW.clone();
  wallE.position.set(2.52, 0.54, 0);
  // Beveled parapet coping cap along east & west raceway walls
  const copingW = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 4.64), concreteMat);
  copingW.position.set(-2.52, 1.0, 0);
  const copingE = copingW.clone();
  copingE.position.set(2.52, 1.0, 0);
  rasGroup.add(wallN, wallS, wallW, wallE, copingW, copingE);

  // Anti-slip walkway grating along front wall
  const grate = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.06, 0.46), grateMat);
  grate.position.set(0, 1.02, 2.14);
  grate.castShadow = true;
  rasGroup.add(grate);

  // Stainless circulation manifold + flange collars + valves + external swirl separator + overhead bridge pipe + biofilter rack
  const manifoldPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.9, 12), pipeMat);
  manifoldPipe.rotation.z = Math.PI / 2;
  manifoldPipe.position.set(0, 1.08, -2.14);
  manifoldPipe.castShadow = true;
  [-1.8, -0.6, 0.6, 1.8].forEach((fx) => {
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.05, 12), pipeMat);
    flange.rotation.z = Math.PI / 2;
    flange.position.set(fx, 1.08, -2.14);
    rasGroup.add(flange);
  });
  const overheadPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 4.2, 10), pipeMat);
  overheadPipe.rotation.x = Math.PI / 2;
  overheadPipe.position.set(-2.45, 1.15, 0);
  overheadPipe.castShadow = true;
  const valve1 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 12), valveRedMat);
  valve1.rotation.x = Math.PI / 2;
  valve1.position.set(-1.3, 1.08, -1.98);
  const valve2 = valve1.clone();
  valve2.position.set(1.3, 1.08, -1.98);
  const pumpBox = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.62, 0.65), accentBlueMat);
  pumpBox.position.set(-2.15, 0.48, -2.42);
  pumpBox.castShadow = true;
  const pumpMotorCap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.24, 12), pipeMat);
  pumpMotorCap.position.set(-2.15, 0.88, -2.42);
  const swirlDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.22, 1.05, 16), accentBlueMat);
  swirlDrum.position.set(2.15, 0.62, -2.42);
  swirlDrum.castShadow = true;
  const swirlSightGlass = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.48, 0.06), kioskGlassMat);
  swirlSightGlass.position.set(2.15, 0.68, -2.08);
  const bioRack = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.72, 0.48), concreteMat);
  bioRack.position.set(0, 0.52, -2.42);
  bioRack.castShadow = true;
  const bioMediaChamber = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.28, 0.34), grateMat);
  bioMediaChamber.position.set(0, 0.88, -2.42);
  const pressureGauge = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12), pipeMat);
  pressureGauge.rotation.x = Math.PI / 2;
  pressureGauge.position.set(-2.15, 0.92, -2.1);
  const gaugeDial = new THREE.Mesh(
    new THREE.CircleGeometry(0.085, 12),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })
  );
  gaugeDial.position.set(-2.15, 0.92, -2.068);
  rasGroup.add(
    manifoldPipe,
    overheadPipe,
    valve1,
    valve2,
    pumpBox,
    pumpMotorCap,
    swirlDrum,
    swirlSightGlass,
    bioRack,
    bioMediaChamber,
    pressureGauge,
    gaugeDial
  );
  attachOptionalGlbOverride(rasGroup, rasGroup, OPTIONAL_GLB_ASSETS.pondRas, {
    targetFootprint: 5.5,
  });
  root.add(rasGroup);

  // --- 3B. NATURAL POND-EDGE ROCKS & SHORELINE TUFTS ---
  const edgeRocksGroup = new THREE.Group();
  const rockSlateMat = new THREE.MeshPhysicalMaterial({
    map: textures.concrete,
    normalMap: textures.stoneNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: textures.stoneRoughness,
    color: 0x6b7280,
    roughness: 0.86,
    clearcoat: 0.1,
    clearcoatRoughness: 0.45,
    envMapIntensity: 1.0,
  });
  const rockMossMat = new THREE.MeshPhysicalMaterial({
    map: textures.concrete,
    normalMap: textures.stoneNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: textures.stoneRoughness,
    color: 0x5c7457,
    roughness: 0.9,
    clearcoat: 0.08,
    clearcoatRoughness: 0.5,
    envMapIntensity: 0.95,
  });
  const shoreTuftMat = new THREE.MeshPhysicalMaterial({
    color: 0x4b873d,
    roughness: 0.78,
    clearcoat: 0.14,
    clearcoatRoughness: 0.42,
    envMapIntensity: 0.95,
  });
  const rockGeoA = createOrganicRockGeometry(slotIndex * 1.7 + 0.5, 0.3, 1);
  const rockGeoB = createOrganicRockGeometry(slotIndex * 2.3 + 2.1, 0.21, 1);
  const rockGeoC = createOrganicRockGeometry(slotIndex * 3.1 + 4.3, 0.14, 0);
  const shoreBladeGeo = new THREE.ConeGeometry(0.036, 0.32, 4);
  shoreBladeGeo.translate(0, 0.16, 0);

  const rockAnchors: Array<[number, number, number]> = [
    [-2.94, -2.32, 1.08],
    [2.94, -2.32, 1.02],
    [-2.94, 2.28, 1.12],
    [2.94, 2.28, 1.05],
    [-3.06, 0.38, 0.95],
    [3.06, -0.35, 0.96],
    [-1.78, 2.62, 0.86],
    [1.78, 2.62, 0.88],
  ];
  rockAnchors.forEach(([rx, rz, sc], rIdx) => {
    const rCluster = new THREE.Group();
    rCluster.position.set(rx, 0, rz);
    rCluster.rotation.y = rIdx * 1.37 + slotIndex * 0.4;
    rCluster.scale.setScalar(sc);

    const mainStone = new THREE.Mesh(
      rockGeoA,
      rIdx % 2 === 0 ? rockSlateMat : rockMossMat
    );
    mainStone.position.set(0, 0.09, 0);
    mainStone.castShadow = true;
    mainStone.receiveShadow = true;

    const companionStone = new THREE.Mesh(
      rockGeoB,
      rIdx % 2 === 0 ? rockMossMat : rockSlateMat
    );
    companionStone.position.set(0.24, 0.06, 0.12);
    companionStone.rotation.y = 1.1;
    companionStone.castShadow = true;
    companionStone.receiveShadow = true;

    const pebble = new THREE.Mesh(rockGeoC, rockSlateMat);
    pebble.position.set(-0.2, 0.04, 0.16);
    pebble.receiveShadow = true;

    rCluster.add(mainStone, companionStone, pebble);

    if (rIdx % 2 === 0) {
      for (let b = 0; b < 3; b++) {
        const blade = new THREE.Mesh(shoreBladeGeo, shoreTuftMat);
        blade.position.set(-0.14 + b * 0.11, 0.02, -0.14);
        blade.rotation.set(0.18 - b * 0.08, b * 0.9, (b - 1) * 0.24);
        rCluster.add(blade);
      }
    }
    edgeRocksGroup.add(rCluster);
  });
  root.add(edgeRocksGroup);

  // --- 3C. DECORATIVE AQUATIC VEGETATION (TERATAI / LOTUS & ECENG GONDOK / WATER HYACINTH) ---
  const aquaticVegGroup = new THREE.Group();
  aquaticVegGroup.position.y = 0.68;
  const vegSharedGeos = createAquaticSharedGeometries();
  const vegMats: AquaticPlantMaterials = {
    padMat: new THREE.MeshPhysicalMaterial({
      color: 0x2f8541,
      roughness: 0.34,
      clearcoat: 0.52,
      clearcoatRoughness: 0.2,
      envMapIntensity: 1.15,
    }),
    padDarkMat: new THREE.MeshPhysicalMaterial({
      color: 0x226835,
      roughness: 0.38,
      clearcoat: 0.48,
      clearcoatRoughness: 0.24,
      envMapIntensity: 1.1,
    }),
    petalPinkMat: new THREE.MeshPhysicalMaterial({
      color: 0xf472b6,
      roughness: 0.42,
      clearcoat: 0.32,
      clearcoatRoughness: 0.28,
      envMapIntensity: 1.05,
    }),
    petalCreamMat: new THREE.MeshPhysicalMaterial({
      color: 0xfdf2f8,
      roughness: 0.4,
      clearcoat: 0.34,
      clearcoatRoughness: 0.26,
      envMapIntensity: 1.05,
    }),
    stamenMat: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.48 }),
    bulbMat: new THREE.MeshPhysicalMaterial({
      color: 0x65a30d,
      roughness: 0.36,
      clearcoat: 0.45,
      clearcoatRoughness: 0.24,
      envMapIntensity: 1.08,
    }),
    leafMat: new THREE.MeshPhysicalMaterial({
      color: 0x22a648,
      roughness: 0.28,
      clearcoat: 0.62,
      clearcoatRoughness: 0.18,
      envMapIntensity: 1.18,
    }),
    flowerVioletMat: new THREE.MeshPhysicalMaterial({
      color: 0xa855f7,
      roughness: 0.38,
      clearcoat: 0.3,
      envMapIntensity: 1.05,
    }),
    rootMat: new THREE.MeshStandardMaterial({ color: 0x3a3322, roughness: 0.92 }),
  };

  const vegClusterConfigs: Array<{
    kind: 'teratai' | 'eceng' | 'mixed';
    konvPos: [number, number];
    bioPos: [number, number];
    rasPos: [number, number];
    phase: number;
    group: THREE.Group;
  }> = [
    {
      kind: 'teratai',
      konvPos: [-1.62, -1.36],
      bioPos: [-1.18, -1.04],
      rasPos: [-1.72, -1.38],
      phase: slotIndex * 0.9 + 0.3,
      group: createAquaticVegetationCluster('teratai', vegMats, vegSharedGeos, slotIndex + 1),
    },
    {
      kind: 'eceng',
      konvPos: [1.62, -1.24],
      bioPos: [1.22, -0.94],
      rasPos: [1.68, -1.28],
      phase: slotIndex * 1.2 + 1.9,
      group: createAquaticVegetationCluster('eceng', vegMats, vegSharedGeos, slotIndex + 2),
    },
    {
      kind: 'mixed',
      konvPos: [-1.54, 1.28],
      bioPos: [-1.12, 1.08],
      rasPos: [-1.68, 1.35],
      phase: slotIndex * 1.5 + 3.1,
      group: createAquaticVegetationCluster('mixed', vegMats, vegSharedGeos, slotIndex + 3),
    },
  ];
  vegClusterConfigs.forEach((cfg) => {
    cfg.group.position.set(cfg.konvPos[0], 0, cfg.konvPos[1]);
    aquaticVegGroup.add(cfg.group);
  });
  root.add(aquaticVegGroup);

  const structureMaterials: THREE.MeshPhysicalMaterial[] = [
    kioskWoodMat,
    kioskConcreteMat,
    kioskRoofMat,
    kioskGlassMat,
    linerMat,
    linerDarkMat,
    earthMat,
    bambooMat,
    pvcMat,
    deckMat,
    wireMeshMat,
    wireSteelMat,
    bioConcreteMat,
    concreteMat,
    rasFloorMat,
    accentBlueMat,
    pipeMat,
    valveRedMat,
    grateMat,
    rockSlateMat,
    rockMossMat,
    shoreTuftMat,
    vegMats.padMat,
    vegMats.padDarkMat,
    vegMats.petalPinkMat,
    vegMats.petalCreamMat,
    vegMats.bulbMat,
    vegMats.leafMat,
    vegMats.flowerVioletMat,
  ];

  // --- Physical Clearcoat Water Surface with Custom GLSL Wave + Caustics Shader ---
  const waterGeo = new THREE.PlaneGeometry(4.75, 4.05, 28, 24);
  const waterMat = new THREE.MeshPhysicalMaterial({
    map: textures.waterCaustics,
    normalMap: textures.waterNormals,
    normalScale: new THREE.Vector2(0.55, 0.55),
    color: 0x2ca3c4,
    roughness: 0.08,
    metalness: 0.04,
    clearcoat: 0.96,
    clearcoatRoughness: 0.06,
    ior: 1.333,
    reflectivity: 0.85,
    transparent: true,
    opacity: 0.78,
  });
  waterMat.customProgramCacheKey = () => 'pond-water-physical-v2';
  waterMat.userData.uTime = { value: 0 };
  waterMat.userData.uAeration = { value: 0 };
  waterMat.userData.uRainIntensity = { value: 0 };
  waterMat.userData.uHeatIntensity = { value: 0 };
  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterMat.userData.uTime;
    shader.uniforms.uAeration = waterMat.userData.uAeration;
    shader.uniforms.uRainIntensity = waterMat.userData.uRainIntensity;
    shader.uniforms.uHeatIntensity = waterMat.userData.uHeatIntensity;
    shader.vertexShader =
      `uniform float uTime;\nuniform float uAeration;\nuniform float uRainIntensity;\nuniform float uHeatIntensity;\nvarying vec2 vPondUv;\n` +
      shader.vertexShader
        .replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          vPondUv = uv;
          float rDist = length(position.xy);
          float calmFactor = 1.0 - uHeatIntensity * 0.45;
          float ripple = (sin(position.x * 3.8 + uTime * 2.1) * 0.012 + cos(position.y * 4.2 - uTime * 1.8) * 0.011) * calmFactor;
          float rainChop = (sin(position.x * 11.0 + uTime * 7.5) * cos(position.y * 10.5 - uTime * 6.8) * 0.014 + sin(rDist * 14.0 - uTime * 9.0) * 0.008) * uRainIntensity;
          float heatSwell = sin(position.x * 1.8 + position.y * 1.4 + uTime * 1.1) * 0.007 * uHeatIntensity;
          float aeroWave = sin(rDist * 9.5 - uTime * 5.2) * 0.018 * uAeration * exp(-rDist * 0.55);
          transformed.z += ripple + rainChop + heatSwell + aeroWave;
          `
        );
    shader.fragmentShader =
      `uniform float uTime;\nuniform float uAeration;\nuniform float uRainIntensity;\nuniform float uHeatIntensity;\nvarying vec2 vPondUv;\n
      float pondHash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float pondRainLayer(vec2 uv, float gridScale, float speed, float time) {
        vec2 gv = fract(uv * gridScale) - 0.5;
        vec2 id = floor(uv * gridScale);
        float seed = pondHash21(id);
        float life = fract(time * speed + seed);
        vec2 offset = vec2(seed - 0.5, fract(seed * 17.3) - 0.5) * 0.36;
        float d = length(gv - offset);
        float radius = life * 0.44;
        float ring = smoothstep(0.055, 0.0, abs(d - radius)) * (1.0 - life);
        return ring;
      }\n` +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        vec2 shimmerShift = vec2(
          sin(vPondUv.y * 26.0 + uTime * 4.8) * 0.014,
          cos(vPondUv.x * 22.0 - uTime * 3.9) * 0.011
        ) * uHeatIntensity;
        vec2 cUv1 = (vPondUv + shimmerShift) * 5.2 + vec2(uTime * 0.09, -uTime * 0.07);
        vec2 cUv2 = (vPondUv - shimmerShift * 0.8) * 6.8 - vec2(uTime * 0.06, uTime * 0.11);
        float c1 = sin(cUv1.x * 6.2831) * cos(cUv1.y * 6.2831);
        float c2 = sin(cUv2.x * 6.2831 + c1) * cos(cUv2.y * 6.2831);
        float causticGlow = smoothstep(0.32, 0.95, 0.5 + 0.5 * (c1 * 0.5 + c2 * 0.5));
        diffuseColor.rgb += vec3(0.11, 0.19, 0.22) * causticGlow;

        // Panas Terik heat shimmer solar glint & mirage sheen
        float heatGlint = pow(causticGlow, 2.6) * (0.65 + 0.35 * sin(uTime * 5.5 + vPondUv.x * 18.0));
        diffuseColor.rgb += vec3(0.44, 0.38, 0.18) * heatGlint * uHeatIntensity;

        // Hujan Deras procedural raindrop splash ripples & storm overcast tint
        float rainSplash = 0.0;
        if (uRainIntensity > 0.01) {
          rainSplash += pondRainLayer(vPondUv, 6.5, 1.9, uTime);
          rainSplash += pondRainLayer(vPondUv + vec2(0.37, 0.71), 10.5, 2.4, uTime + 1.3) * 0.75;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.8, 0.88, 0.95), uRainIntensity * 0.28);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.96, 1.0), clamp(rainSplash * uRainIntensity * 0.72, 0.0, 0.78));
        }

        float centerDist = length(vPondUv - vec2(0.5));
        float foamRing = smoothstep(0.24, 0.05, abs(centerDist - 0.14)) * (0.35 + 0.65 * causticGlow) * uAeration;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.98, 1.0), clamp(foamRing * 0.55, 0.0, 0.55));
        `
      );
  };
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.y = 0.72;
  waterMesh.receiveShadow = true;
  root.add(waterMesh);

  // Aeration Bubbles InstancedMesh
  const bubbleGeo = new THREE.SphereGeometry(0.048, 6, 6);
  const bubbleMat = new THREE.MeshStandardMaterial({
    color: 0xe0f7ff,
    roughness: 0.1,
    transparent: true,
    opacity: 0.78,
  });
  const bubbleMesh = new THREE.InstancedMesh(bubbleGeo, bubbleMat, MAX_BUBBLES);
  bubbleMesh.frustumCulled = false;
  root.add(bubbleMesh);

  // --- Upgrade 1: Canopy (3 visual tiers) ---
  const canopyGroup = new THREE.Group();
  const canopyTiers: THREE.Group[] = [];

  const c1 = new THREE.Group();
  [
    [-2.45, -2.1],
    [2.45, -2.1],
    [-2.45, 2.1],
    [2.45, 2.1],
  ].forEach(([px, pz]) => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 2.3, 8), bambooMat);
    col.position.set(px, 1.15, pz);
    col.castShadow = true;
    c1.add(col);
  });
  const roof1 = new THREE.Mesh(
    new THREE.BoxGeometry(5.4, 0.08, 4.7),
    new THREE.MeshStandardMaterial({ color: 0xa17c47, roughness: 0.9 })
  );
  roof1.position.y = 2.35;
  roof1.castShadow = true;
  c1.add(roof1);
  canopyTiers.push(c1);
  canopyGroup.add(c1);

  const c2 = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.35, metalness: 0.8 });
  [
    [-2.55, -2.15],
    [2.55, -2.15],
    [-2.55, 2.15],
    [2.55, 2.15],
  ].forEach(([px, pz]) => {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.12), steelMat);
    col.position.set(px, 1.25, pz);
    col.castShadow = true;
    c2.add(col);
  });
  const corrMat = new THREE.MeshStandardMaterial({
    map: textures.metalCorrugated,
    color: 0x38bdf8,
    roughness: 0.38,
    metalness: 0.55,
  });
  const roof2L = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.09, 2.55), corrMat);
  roof2L.position.set(0, 2.65, -1.15);
  roof2L.rotation.x = -0.18;
  roof2L.castShadow = true;
  const roof2R = roof2L.clone();
  roof2R.position.set(0, 2.65, 1.15);
  roof2R.rotation.x = 0.18;
  c2.add(roof2L, roof2R);
  canopyTiers.push(c2);
  canopyGroup.add(c2);

  const c3 = new THREE.Group();
  const whiteAlloyMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.25, metalness: 0.7 });
  [
    [-2.6, -2.2],
    [2.6, -2.2],
    [-2.6, 2.2],
    [2.6, 2.2],
  ].forEach(([px, pz]) => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.7, 12), whiteAlloyMat);
    col.position.set(px, 1.35, pz);
    col.castShadow = true;
    c3.add(col);
  });
  const polyMat = new THREE.MeshPhysicalMaterial({
    color: 0xbae6fd,
    roughness: 0.15,
    clearcoat: 0.85,
    transparent: true,
    opacity: 0.62,
  });
  const roof3 = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.07, 4.7), polyMat);
  roof3.position.set(0, 2.7, 0);
  roof3.rotation.x = 0.06;
  c3.add(roof3);
  canopyTiers.push(c3);
  canopyGroup.add(c3);

  // Canopy Lv.4: Solar Pergola
  const c4 = new THREE.Group();
  [
    [-2.6, -2.2],
    [2.6, -2.2],
    [-2.6, 2.2],
    [2.6, 2.2],
  ].forEach(([px, pz]) => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.8, 12), whiteAlloyMat);
    col.position.set(px, 1.4, pz);
    col.castShadow = true;
    c4.add(col);
  });
  const solarPergolaMat = new THREE.MeshStandardMaterial({
    map: textures.solarGrid,
    roughness: 0.2,
    metalness: 0.65,
    transparent: true,
    opacity: 0.9,
  });
  const roof4 = new THREE.Mesh(new THREE.BoxGeometry(5.75, 0.09, 4.85), solarPergolaMat);
  roof4.position.set(0, 2.85, 0);
  roof4.rotation.x = 0.09;
  roof4.castShadow = true;
  c4.add(roof4);
  canopyTiers.push(c4);
  canopyGroup.add(c4);

  // Canopy Lv.5: Micro-Climate Automated Dome Arch
  const c5 = new THREE.Group();
  for (let a = -1; a <= 1; a++) {
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(2.65, 0.07, 8, 28, Math.PI),
      whiteAlloyMat
    );
    arch.position.set(0, 0.9, a * 1.6);
    c5.add(arch);
  }
  const roof5 = new THREE.Mesh(new THREE.BoxGeometry(5.85, 0.08, 4.95), solarPergolaMat);
  roof5.position.set(0, 3.1, 0);
  const mistRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.7, 0.04, 8, 28),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 1.1 })
  );
  mistRing.rotation.x = Math.PI / 2;
  mistRing.position.y = 2.95;
  c5.add(roof5, mistRing);
  canopyTiers.push(c5);
  canopyGroup.add(c5);
  root.add(canopyGroup);

  // --- Upgrade 2: Aerator (Lv.1..5) ---
  const aeratorGroup = new THREE.Group();
  const aeratorRotors: THREE.Object3D[] = [];
  const floatMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 });
  const paddleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3, metalness: 0.6 });

  const floatL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 1.0), floatMat);
  floatL.position.set(-0.68, 0.74, 0);
  const floatR = floatL.clone();
  floatR.position.set(0.68, 0.74, 0);
  const motorBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.42), steelMat);
  motorBox.position.set(0, 0.88, -0.22);

  const rotor = new THREE.Group();
  rotor.position.set(0, 0.78, 0.14);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.24, 10), paddleMat);
  axle.rotation.z = Math.PI / 2;
  rotor.add(axle);
  for (let b = 0; b < 6; b++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.04), paddleMat);
    blade.rotation.x = (b * Math.PI) / 3;
    rotor.add(blade);
  }
  aeratorRotors.push(rotor);
  aeratorGroup.add(floatL, floatR, motorBox, rotor);

  const aeratorLv2Parts = new THREE.Group();
  const rotor2 = new THREE.Group();
  rotor2.position.set(0, 0.78, -0.62);
  rotor2.add(axle.clone());
  for (let b = 0; b < 6; b++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.04), paddleMat);
    blade.rotation.x = (b * Math.PI) / 3;
    rotor2.add(blade);
  }
  const motorBridge = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.85), floatMat);
  motorBridge.position.set(0, 0.86, -0.22);
  aeratorRotors.push(rotor2);
  aeratorLv2Parts.add(rotor2, motorBridge);
  aeratorGroup.add(aeratorLv2Parts);

  const aeratorLv3Parts = new THREE.Group();
  const nanoTower = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.65, 14), whiteAlloyMat);
  nanoTower.position.set(-1.3, 0.92, -1.1);
  const nanoGlow = new THREE.Mesh(
    new THREE.TorusGeometry(0.32, 0.035, 8, 20),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 1.4 })
  );
  nanoGlow.rotation.x = Math.PI / 2;
  nanoGlow.position.set(-1.3, 0.78, -1.1);
  aeratorLv3Parts.add(nanoTower, nanoGlow);
  aeratorGroup.add(aeratorLv3Parts);

  const aeratorLv4Parts = new THREE.Group();
  const nanoTower2 = nanoTower.clone();
  nanoTower2.position.set(1.3, 0.92, -1.1);
  const nanoLink = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8), pvcMat);
  nanoLink.rotation.z = Math.PI / 2;
  nanoLink.position.set(0, 1.15, -1.1);
  aeratorLv4Parts.add(nanoTower2, nanoLink);
  aeratorGroup.add(aeratorLv4Parts);

  const aeratorLv5Parts = new THREE.Group();
  const plasmaTurbine = new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.05, 10, 24),
    new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x06b6d4, emissiveIntensity: 1.7 })
  );
  plasmaTurbine.rotation.x = Math.PI / 2;
  plasmaTurbine.position.set(0, 1.18, -0.22);
  aeratorLv5Parts.add(plasmaTurbine);
  aeratorGroup.add(aeratorLv5Parts);
  root.add(aeratorGroup);

  // --- Upgrade 3: Auto-Feeder (Lv.1..4) ---
  const autoFeederGroup = new THREE.Group();
  const feederStand = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.4, 10), steelMat);
  feederStand.position.set(2.0, 0.7, 1.75);
  const hopper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.16, 0.6, 12),
    new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.35, metalness: 0.4 })
  );
  hopper.position.set(2.0, 1.55, 1.75);
  hopper.castShadow = true;
  const hopperCap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.22, 12), whiteAlloyMat);
  hopperCap.position.set(2.0, 1.95, 1.75);
  const autoFeederArm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.07), paddleMat);
  autoFeederArm.position.set(1.75, 1.22, 1.6);
  autoFeederGroup.add(feederStand, hopper, hopperCap, autoFeederArm);

  const autoFeederLv2Parts = new THREE.Group();
  const feederSolar = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.05, 0.55),
    new THREE.MeshStandardMaterial({ map: textures.solarGrid, roughness: 0.2, metalness: 0.6 })
  );
  feederSolar.position.set(2.0, 2.15, 1.75);
  feederSolar.rotation.x = 0.32;
  const feederChute2 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.75, 8), pvcMat);
  feederChute2.rotation.z = Math.PI / 3;
  feederChute2.position.set(1.55, 1.28, 1.48);
  autoFeederLv2Parts.add(feederSolar, feederChute2);
  autoFeederGroup.add(autoFeederLv2Parts);

  const autoFeederLv3Parts = new THREE.Group();
  const hopper2 = hopper.clone();
  hopper2.position.set(-2.0, 1.55, -1.75);
  const stand2 = feederStand.clone();
  stand2.position.set(-2.0, 0.7, -1.75);
  autoFeederLv3Parts.add(hopper2, stand2);
  autoFeederGroup.add(autoFeederLv3Parts);

  const autoFeederLv4Parts = new THREE.Group();
  const acousticDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 1.2 })
  );
  acousticDome.position.set(2.0, 2.38, 1.75);
  autoFeederLv4Parts.add(acousticDome);
  autoFeederGroup.add(autoFeederLv4Parts);
  root.add(autoFeederGroup);

  // --- Upgrade 4: IoT Sensor (Lv.1..4) ---
  const iotGroup = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.055, 1.8, 8), whiteAlloyMat);
  mast.position.set(-2.1, 0.9, 1.85);
  const sensorBox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.38, 0.22), whiteAlloyMat);
  sensorBox.position.set(-2.1, 1.4, 1.85);
  const iotLedMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: 1.4,
  });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), iotLedMat);
  led.position.set(-2.1, 1.82, 1.85);
  const smallSolar = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.04, 0.3),
    new THREE.MeshStandardMaterial({ map: textures.solarGrid, roughness: 0.2, metalness: 0.5 })
  );
  smallSolar.position.set(-2.1, 1.72, 1.85);
  smallSolar.rotation.x = 0.4;
  iotGroup.add(mast, sensorBox, led, smallSolar);

  const iotLv2Parts = new THREE.Group();
  const probeArm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 8), paddleMat);
  probeArm.rotation.z = Math.PI / 2;
  probeArm.position.set(-1.72, 1.05, 1.85);
  const probeDip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), accentBlueMat);
  probeDip.position.set(-1.32, 0.78, 1.85);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.65, 6), whiteAlloyMat);
  antenna.position.set(-2.1, 2.15, 1.85);
  iotLv2Parts.add(probeArm, probeDip, antenna);
  iotGroup.add(iotLv2Parts);

  const iotLv3Parts = new THREE.Group();
  const vane = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.06), floatMat);
  vane.position.set(-2.1, 2.38, 1.85);
  iotLv3Parts.add(vane);
  iotGroup.add(iotLv3Parts);

  const iotLv4Parts = new THREE.Group();
  const satDish = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.18, 14, 1, true), whiteAlloyMat);
  satDish.rotation.x = -Math.PI / 3;
  satDish.position.set(-2.1, 2.6, 1.85);
  iotLv4Parts.add(satDish);
  iotGroup.add(iotLv4Parts);
  root.add(iotGroup);

  // --- Upgrade 5: Filter (Lv.1..5) ---
  const filterGroup = new THREE.Group();
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.38, 1.0, 16),
    new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.35, metalness: 0.5 })
  );
  drum.position.set(2.3, 0.55, -1.85);
  drum.castShadow = true;
  const uvTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 0.9, 12),
    new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x06b6d4, emissiveIntensity: 0.85 })
  );
  uvTube.position.set(1.75, 0.68, -2.05);
  filterGroup.add(drum, uvTube);

  const filterLv2Parts = new THREE.Group();
  const bioDrum2 = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.92, 16), concreteMat);
  bioDrum2.position.set(1.2, 0.52, -2.05);
  bioDrum2.castShadow = true;
  const linkPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.25, 8), pvcMat);
  linkPipe.rotation.z = Math.PI / 2;
  linkPipe.position.set(1.75, 0.95, -1.95);
  filterLv2Parts.add(bioDrum2, linkPipe);
  filterGroup.add(filterLv2Parts);

  const filterLv3Parts = new THREE.Group();
  const ozoneCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 1.15, 14),
    new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0891b2, emissiveIntensity: 1.5 })
  );
  ozoneCore.position.set(0.65, 0.72, -2.05);
  filterLv3Parts.add(ozoneCore);
  filterGroup.add(filterLv3Parts);

  const filterLv4Parts = new THREE.Group();
  const plasmaBio = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.32, 1.25, 14),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 1.0 })
  );
  plasmaBio.position.set(-0.2, 0.7, -2.05);
  filterLv4Parts.add(plasmaBio);
  filterGroup.add(filterLv4Parts);

  const filterLv5Parts = new THREE.Group();
  const membraneRack = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.85, 0.42), whiteAlloyMat);
  membraneRack.position.set(-1.1, 0.65, -2.05);
  filterLv5Parts.add(membraneRack);
  filterGroup.add(filterLv5Parts);
  root.add(filterGroup);

  // --- Upgrade 6: Grading (Lv.1..4) ---
  const gradingGroup = new THREE.Group();
  const chute = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.34, 0.42), paddleMat);
  chute.position.set(0, 0.95, 2.05);
  const gantryL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.8, 0.07), steelMat);
  gantryL.position.set(-0.46, 1.15, 2.05);
  const gantryR = gantryL.clone();
  gantryR.position.set(0.46, 1.15, 2.05);
  const gantryTop = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.07, 0.1), floatMat);
  gantryTop.position.set(0, 1.55, 2.05);
  const gradingLv2Bar = new THREE.Mesh(
    new THREE.BoxGeometry(0.82, 0.04, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x10b981, emissiveIntensity: 1.6 })
  );
  gradingLv2Bar.position.set(0, 1.32, 2.05);
  const gradingLv3Parts = new THREE.Group();
  const convRamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.52), steelMat);
  convRamp.position.set(0.75, 1.02, 2.05);
  convRamp.rotation.z = -0.18;
  gradingLv3Parts.add(convRamp);
  const gradingLv4Parts = new THREE.Group();
  const bioRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.045, 8, 22),
    new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x06b6d4, emissiveIntensity: 1.5 })
  );
  bioRing.position.set(0, 1.25, 2.05);
  gradingLv4Parts.add(bioRing);
  gradingGroup.add(chute, gantryL, gantryR, gantryTop, gradingLv2Bar, gradingLv3Parts, gradingLv4Parts);
  root.add(gradingGroup);

  // --- Upgrade 7: Futuristic Module (Lv.1..3) ---
  const futuristicGroup = new THREE.Group();
  const holoMat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x06b6d4,
    emissiveIntensity: 1.5,
    transparent: true,
    opacity: 0.78,
  });
  const holoRing = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.038, 10, 40), holoMat);
  holoRing.rotation.x = Math.PI / 2;
  holoRing.position.y = 1.85;
  const pylon1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.9, 8), whiteAlloyMat);
  pylon1.position.set(-2.25, 0.95, -1.9);
  const pylon2 = pylon1.clone();
  pylon2.position.set(2.25, 0.95, 1.9);

  const futuristicLv2Parts = new THREE.Group();
  const holoRing2 = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.032, 8, 32), holoMat);
  holoRing2.rotation.x = Math.PI / 2;
  holoRing2.position.y = 2.1;
  futuristicLv2Parts.add(holoRing2);

  const futuristicLv3Parts = new THREE.Group();
  const quantumCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), holoMat);
  quantumCore.position.y = 2.25;
  futuristicLv3Parts.add(quantumCore);

  futuristicGroup.add(holoRing, pylon1, pylon2, futuristicLv2Parts, futuristicLv3Parts);
  root.add(futuristicGroup);

  // --- Fish School (Density-, Time-, Species- & Surface-Feeding Driven) ---
  const fishMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0.14,
    envMapIntensity: 1.15,
  });
  const fishMesh = new THREE.InstancedMesh(initialFishGeo, fishMat, MAX_VISUAL_FISH);
  fishMesh.frustumCulled = false;
  fishMesh.castShadow = true;
  const fishPhases = new Float32Array(MAX_VISUAL_FISH * 3);
  const fishPos = new Float32Array(MAX_VISUAL_FISH * 3);
  const fishVel = new Float32Array(MAX_VISUAL_FISH * 3);
  for (let i = 0; i < MAX_VISUAL_FISH; i++) {
    const a = (i / MAX_VISUAL_FISH) * Math.PI * 2 + (i % 3) * 0.37;
    const r = 0.5 + ((i * 0.29) % 1.25);
    fishPhases[i * 3] = a;
    fishPhases[i * 3 + 1] = r;
    fishPhases[i * 3 + 2] = 0.68 + ((i * 0.19) % 0.55);
    fishPos[i * 3] = Math.cos(a) * r;
    fishPos[i * 3 + 1] = 0.5;
    fishPos[i * 3 + 2] = Math.sin(a) * r * 0.85;
    fishVel[i * 3] = -Math.sin(a) * 0.7;
    fishVel[i * 3 + 1] = 0;
    fishVel[i * 3 + 2] = Math.cos(a) * 0.7;
    fishMesh.setColorAt(i, _color.setHex(0xf97316));
  }
  if (fishMesh.instanceColor) fishMesh.instanceColor.needsUpdate = true;
  root.add(fishMesh);

  // --- Feed Pellets ---
  const pelletGeo = new THREE.SphereGeometry(0.044, 6, 6);
  const pelletMat = new THREE.MeshStandardMaterial({ color: 0xa16207, roughness: 0.82 });
  const pelletMesh = new THREE.InstancedMesh(pelletGeo, pelletMat, MAX_PELLETS);
  pelletMesh.frustumCulled = false;
  pelletMesh.visible = false;
  const pelletPos = new Float32Array(MAX_PELLETS * 3);
  root.add(pelletMesh);

  // --- Surface Feeding Splash Ripples ---
  const splashGeo = new THREE.RingGeometry(0.07, 0.115, 18);
  splashGeo.rotateX(-Math.PI / 2);
  const splashMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const splashRingMesh = new THREE.InstancedMesh(splashGeo, splashMat, MAX_SPLASH_RINGS);
  splashRingMesh.frustumCulled = false;
  splashRingMesh.visible = false;
  const splashRings = new Float32Array(MAX_SPLASH_RINGS * 3); // x, z, age (<= 0 inactive)
  let nextSplashCursor = 0;
  root.add(splashRingMesh);

  const feedBurstState = { timer: 0, lastSeenStamp: -1 };
  const FEED_BURST_DURATION = 5.0;
  let activeSpecies: SpeciesId | null = null;
  let lastPondIdentity = '';

  const syncFromState = (pond: PondState | undefined, selected: boolean) => {
    if (!pond) {
      root.visible = false;
      feedBurstState.timer = 0;
      return;
    }
    const identityKey = `${pond.id}_${pond.branchId}_${pond.built ? pond.pondType : 'empty'}`;
    if (identityKey !== lastPondIdentity) {
      lastPondIdentity = identityKey;
      feedBurstState.timer = 0;
      feedBurstState.lastSeenStamp = pond.lastFeedTime;
      splashRings.fill(0);
      pelletMesh.visible = false;
      splashRingMesh.visible = false;
    }

    root.visible = true;
    selectionRing.visible = selected;
    lockedPlotGroup.visible = !pond.unlocked;
    emptyPlotGroup.visible = pond.unlocked && !pond.built;
    slotKioskGroup.visible = pond.unlocked && pond.built && pond.pondType === 'kios';

    const isFishPond = pond.unlocked && pond.built && pond.pondType !== 'kios';
    konvensionalGroup.visible = isFishPond && pond.pondType === 'konvensional';
    bioflokGroup.visible = isFishPond && pond.pondType === 'bioflok';
    rasGroup.visible = isFishPond && pond.pondType === 'ras';
    waterMesh.visible = isFishPond;
    edgeRocksGroup.visible = isFishPond;
    aquaticVegGroup.visible = isFishPond;

    if (isFishPond) {
      const waterY = pond.pondType === 'bioflok' ? 0.9 : pond.pondType === 'ras' ? 0.82 : 0.68;
      aquaticVegGroup.position.y = waterY;
      const vegScale = pond.pondType === 'bioflok' ? 0.82 : pond.pondType === 'ras' ? 0.74 : 1.0;
      for (let v = 0; v < vegClusterConfigs.length; v++) {
        const cfg = vegClusterConfigs[v];
        const coords =
          pond.pondType === 'bioflok'
            ? cfg.bioPos
            : pond.pondType === 'ras'
            ? cfg.rasPos
            : cfg.konvPos;
        cfg.group.position.x = coords[0];
        cfg.group.position.z = coords[1];
        cfg.group.scale.setScalar(vegScale);
      }
    }

    if (slotKioskGroup.visible) {
      slotKioskPatio.visible = pond.kioskLevel >= 2;
      slotKioskRoof.visible = pond.kioskLevel >= 3;
      slotKioskSolar.visible = pond.kioskLevel >= 4;
      slotKioskLanternMat.emissiveIntensity = pond.kioskLevel >= 4 ? 1.45 : pond.kioskLevel >= 2 ? 0.55 : 0.15;
    }

    canopyGroup.visible = isFishPond && pond.upgrades.canopy > 0;
    canopyTiers.forEach((tier, idx) => {
      tier.visible = pond.upgrades.canopy === idx + 1;
    });
    aeratorGroup.visible = isFishPond && pond.upgrades.aerator > 0;
    aeratorLv2Parts.visible = isFishPond && pond.upgrades.aerator >= 2;
    aeratorLv3Parts.visible = isFishPond && pond.upgrades.aerator >= 3;
    aeratorLv4Parts.visible = isFishPond && pond.upgrades.aerator >= 4;
    aeratorLv5Parts.visible = isFishPond && pond.upgrades.aerator >= 5;

    autoFeederGroup.visible = isFishPond && pond.upgrades.autoFeeder > 0;
    autoFeederLv2Parts.visible = isFishPond && pond.upgrades.autoFeeder >= 2;
    autoFeederLv3Parts.visible = isFishPond && pond.upgrades.autoFeeder >= 3;
    autoFeederLv4Parts.visible = isFishPond && pond.upgrades.autoFeeder >= 4;

    iotGroup.visible = isFishPond && pond.upgrades.iotSensor > 0;
    iotLv2Parts.visible = isFishPond && pond.upgrades.iotSensor >= 2;
    iotLv3Parts.visible = isFishPond && pond.upgrades.iotSensor >= 3;
    iotLv4Parts.visible = isFishPond && pond.upgrades.iotSensor >= 4;

    filterGroup.visible = isFishPond && pond.upgrades.filter > 0;
    filterLv2Parts.visible = isFishPond && pond.upgrades.filter >= 2;
    filterLv3Parts.visible = isFishPond && pond.upgrades.filter >= 3;
    filterLv4Parts.visible = isFishPond && pond.upgrades.filter >= 4;
    filterLv5Parts.visible = isFishPond && pond.upgrades.filter >= 5;

    gradingGroup.visible = isFishPond && pond.upgrades.grading > 0;
    gradingLv2Bar.visible = isFishPond && pond.upgrades.grading >= 2;
    gradingLv3Parts.visible = isFishPond && pond.upgrades.grading >= 3;
    gradingLv4Parts.visible = isFishPond && pond.upgrades.grading >= 4;

    futuristicGroup.visible = isFishPond && pond.upgrades.futuristicModule > 0;
    futuristicLv2Parts.visible = isFishPond && pond.upgrades.futuristicModule >= 2;
    futuristicLv3Parts.visible = isFishPond && pond.upgrades.futuristicModule >= 3;

    if (pond.water.ammoniaPpm > 0.35 || pond.water.doMgL < 3.5) {
      iotLedMat.color.setHex(0xef4444);
      iotLedMat.emissive.setHex(0xef4444);
    } else {
      iotLedMat.color.setHex(0x10b981);
      iotLedMat.emissive.setHex(0x10b981);
    }

    const hasFish = isFishPond && pond.species !== null && pond.fishCount > 0;
    fishMesh.visible = hasFish;
    if (hasFish && pond.species) {
      if (fishGeometries && activeSpecies !== pond.species) {
        activeSpecies = pond.species;
        fishMesh.geometry = fishGeometries[pond.species];
      }
      const sp = SPECIES_CATALOG[pond.species];
      const maxCap = POND_TYPE_SPECS[pond.pondType].maxCapacity || 260;
      const densityRatio = clamp(pond.fishCount / maxCap, 0.05, 1.25);
      const countVis = Math.min(MAX_VISUAL_FISH, Math.max(4, Math.round(4 + densityRatio * 30)));
      fishMesh.count = countVis;
      for (let i = 0; i < countVis; i++) {
        _color.setHex(i % 4 === 0 ? sp.accentHex : sp.colorHex);
        fishMesh.setColorAt(i, _color);
      }
      if (fishMesh.instanceColor) fishMesh.instanceColor.needsUpdate = true;
    }

    bubbleMesh.visible = isFishPond && (pond.pondType === 'bioflok' || pond.upgrades.aerator > 0);

    if (pond.lastFeedTime > feedBurstState.lastSeenStamp && pond.lastFeedTime > 0) {
      feedBurstState.lastSeenStamp = pond.lastFeedTime;
      feedBurstState.timer = FEED_BURST_DURATION;
      const feedOriginX = pond.upgrades.autoFeeder > 0 ? 0.55 : 0.0;
      const feedOriginZ = pond.upgrades.autoFeeder > 0 ? 0.55 : 0.35;
      for (let i = 0; i < MAX_PELLETS; i++) {
        const a = i * 2.39996;
        const r = 0.14 + ((i * 0.19) % 0.92);
        pelletPos[i * 3] = feedOriginX + Math.cos(a) * r;
        pelletPos[i * 3 + 1] = 0.55 + (i % 4) * 0.12; // height above water surface
        pelletPos[i * 3 + 2] = feedOriginZ + Math.sin(a) * r * 0.85;
      }
    }
  };

  const animate = (
    elapsed: number,
    dt: number,
    pond: PondState | undefined,
    speedMult: number,
    dayProgress = 0.5
  ) => {
    if (!pond || !pond.unlocked || !pond.built || pond.pondType === 'kios') {
      pelletMesh.visible = false;
      splashRingMesh.visible = false;
      return;
    }

    const animTimeScale = speedMult === 0 ? 0.3 : Math.min(speedMult, 2.5);
    const stepDt = Math.min(dt, 0.05) * animTimeScale;
    const waterY = pond.pondType === 'bioflok' ? 0.9 : pond.pondType === 'ras' ? 0.82 : 0.68;

    waterMat.userData.uTime.value = elapsed * (0.85 + animTimeScale * 0.25);
    waterMat.userData.uAeration.value =
      pond.pondType === 'bioflok'
        ? Math.min(1.0, 0.65 + pond.upgrades.aerator * 0.12)
        : Math.min(1.0, pond.upgrades.aerator * 0.25);
    waterMesh.position.y = waterY + Math.sin(elapsed * 2.2 + slotIndex) * 0.004;

    // Gentle floating bob & ripple tilt on decorative Teratai & Eceng Gondok clusters
    const vegRipple = 1 + pond.upgrades.aerator * 0.25;
    for (let v = 0; v < vegClusterConfigs.length; v++) {
      const cfg = vegClusterConfigs[v];
      cfg.group.position.y = Math.sin(elapsed * 1.85 + cfg.phase) * 0.011 * vegRipple;
      cfg.group.rotation.x = Math.sin(elapsed * 1.35 + cfg.phase) * 0.04 * vegRipple;
      cfg.group.rotation.z = Math.cos(elapsed * 1.5 + cfg.phase) * 0.04 * vegRipple;
    }

    if (aeratorGroup.visible && speedMult > 0) {
      const spin = (1.5 + pond.upgrades.aerator * 1.4) * dt * Math.min(speedMult, 2.5);
      for (let idx = 0; idx < aeratorRotors.length; idx++) {
        if (idx === 0 || aeratorLv2Parts.visible) {
          aeratorRotors[idx].rotation.x += spin;
        }
      }
    }

    if (autoFeederGroup.visible) {
      autoFeederArm.rotation.y = Math.sin(elapsed * 1.4 + slotIndex) * 0.45;
    }

    if (gradingLv2Bar.visible) {
      gradingLv2Bar.position.y = 1.25 + Math.sin(elapsed * 3.5 + slotIndex) * 0.14;
    }

    if (futuristicGroup.visible) {
      holoRing.rotation.z = elapsed * 0.9;
      holoRing.position.y = 1.85 + Math.sin(elapsed * 2.1) * 0.1;
      if (futuristicLv3Parts.visible) {
        futuristicLv3Parts.rotation.y = elapsed * 1.4;
      }
    }

    if (bubbleMesh.visible) {
      for (let i = 0; i < MAX_BUBBLES; i++) {
        const ang = (i / MAX_BUBBLES) * Math.PI * 2 + elapsed * 0.65;
        const rad = pond.pondType === 'bioflok' ? 0.75 + (i % 3) * 0.4 : 0.4 + (i % 4) * 0.18;
        const rise = ((elapsed * 1.6 + i * 0.27) % 1) * 0.25;
        _dummy.rotation.set(0, 0, 0);
        _dummy.position.set(Math.cos(ang) * rad, waterY - 0.12 + rise, Math.sin(ang) * rad);
        _dummy.scale.setScalar(0.55 + Math.sin(elapsed * 4 + i) * 0.22);
        _dummy.updateMatrix();
        bubbleMesh.setMatrixAt(i, _dummy.matrix);
      }
      bubbleMesh.instanceMatrix.needsUpdate = true;
    }

    // Update falling & floating feed pellets
    const isFeeding = feedBurstState.timer > 0;
    if (isFeeding) {
      feedBurstState.timer = Math.max(0, feedBurstState.timer - dt);
      pelletMesh.visible = true;
      const lifeRatio = clamp(feedBurstState.timer / 1.8, 0.05, 1);
      for (let i = 0; i < MAX_PELLETS; i++) {
        const idx = i * 3;
        if (pelletPos[idx + 1] > 0) {
          pelletPos[idx + 1] = Math.max(0, pelletPos[idx + 1] - dt * 1.35);
        }
        const px = pelletPos[idx] + Math.sin(elapsed * 1.4 + i) * 0.002;
        const pz = pelletPos[idx + 2] + Math.cos(elapsed * 1.2 + i) * 0.002;
        const py = waterY + pelletPos[idx + 1] + Math.sin(elapsed * 5 + i) * 0.012;
        _dummy.rotation.set(0, 0, 0);
        _dummy.position.set(px, py, pz);
        _dummy.scale.setScalar(lifeRatio);
        _dummy.updateMatrix();
        pelletMesh.setMatrixAt(i, _dummy.matrix);
      }
      pelletMesh.instanceMatrix.needsUpdate = true;
    } else {
      pelletMesh.visible = false;
    }

    // Update surface splash rings triggered by feeding strikes
    let activeSplashes = 0;
    for (let s = 0; s < MAX_SPLASH_RINGS; s++) {
      const sIdx = s * 3;
      const age = splashRings[sIdx + 2];
      if (age > 0) {
        splashRings[sIdx + 2] = Math.max(0, age - dt * 1.45);
        const progress = 1 - splashRings[sIdx + 2];
        _dummy.rotation.set(0, 0, 0);
        _dummy.position.set(splashRings[sIdx], waterY + 0.014, splashRings[sIdx + 1]);
        _dummy.scale.setScalar(0.6 + progress * 2.5);
        _dummy.updateMatrix();
        splashRingMesh.setMatrixAt(s, _dummy.matrix);
        activeSplashes++;
      } else {
        _dummy.position.set(0, -10, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        splashRingMesh.setMatrixAt(s, _dummy.matrix);
      }
    }
    if (activeSplashes > 0) {
      splashRingMesh.visible = true;
      splashRingMesh.instanceMatrix.needsUpdate = true;
    } else {
      splashRingMesh.visible = false;
    }

    // Density-, Time-of-Day-, Species- & Surface-Feeding-Driven Fish Schooling Simulation
    if (fishMesh.visible && pond.species) {
      const sp = SPECIES_CATALOG[pond.species];
      const maxCap = POND_TYPE_SPECS[pond.pondType].maxCapacity || 260;
      const densityRatio = clamp(pond.fishCount / maxCap, 0.05, 1.25);
      const weightRatio = clamp(pond.avgWeightKg / sp.harvestWeightKg, 0.08, 1.35);
      const fishScale = 0.46 + weightRatio * 0.9;

      // Time of day regimes (0.0 = 00:00, 0.25 = 06:00, 0.5 = 12:00, 0.75 = 18:00)
      const hour = (((dayProgress % 1) + 1) % 1) * 24;
      const isDawnDusk = (hour >= 5 && hour <= 8.5) || (hour >= 16.5 && hour <= 19.5);
      const isMiddayHeat = hour >= 10.5 && hour <= 15;
      const isNight = hour >= 20 || hour < 4.5;
      const isNocturnalSpecies = pond.species === 'lele' || pond.species === 'patin';

      let timeSpeedMult = 1.0;
      let timeDepthOffset = 0.0;
      if (isDawnDusk) {
        timeSpeedMult = 1.26;
        timeDepthOffset = 0.065;
      } else if (isMiddayHeat) {
        timeSpeedMult = pond.upgrades.canopy > 0 ? 0.94 : 0.8;
        timeDepthOffset = pond.upgrades.canopy > 0 ? -0.02 : -0.095;
      } else if (isNight) {
        if (isNocturnalSpecies) {
          timeSpeedMult = 1.18;
          timeDepthOffset = 0.04;
        } else {
          timeSpeedMult = 0.46;
          timeDepthOffset = -0.085;
        }
      }

      // Density-dependent schooling cohesion, spread radius & swim tempo
      let densityRadScale = 1.0;
      let densitySpeedMult = 1.0;
      let wanderAmp = 0.28;
      let strataSpread = 0.05;
      if (densityRatio < 0.35) {
        // Low density: loose, wandering exploratory pods
        densityRadScale = 1.1;
        densitySpeedMult = 0.82;
        wanderAmp = 0.54;
        strataSpread = 0.04;
      } else if (densityRatio <= 0.78) {
        // Medium density: synchronized vortex cruising
        densityRadScale = 0.95;
        densitySpeedMult = 1.04;
        wanderAmp = 0.22;
        strataSpread = 0.06;
      } else {
        // High density: tight multi-layered milling shoal & brisk turns
        densityRadScale = 0.8;
        densitySpeedMult = 1.24 + (densityRatio - 0.78) * 0.45;
        wanderAmp = 0.14;
        strataSpread = 0.095;
      }

      const lowDoSkim = pond.water.doMgL < 4.2 ? (4.2 - pond.water.doMgL) * 0.045 : 0;
      const baseDepthY = (pond.pondType === 'bioflok' ? 0.65 : pond.pondType === 'ras' ? 0.62 : 0.48) + timeDepthOffset + lowDoSkim;
      const isBioflok = pond.pondType === 'bioflok';
      const maxX = isBioflok ? 1.88 : pond.pondType === 'ras' ? 2.0 : 1.92;
      const maxZ = isBioflok ? 1.88 : pond.pondType === 'ras' ? 1.68 : 1.64;
      const swirlDir = slotIndex % 2 === 0 ? 1 : -1;
      const smoothFactor = 1 - Math.exp(-5.4 * stepDt);

      _dummy.rotation.order = 'YXZ';

      for (let i = 0; i < fishMesh.count; i++) {
        const fIdx = i * 3;
        const phase = fishPhases[fIdx];
        const baseRad = clamp(fishPhases[fIdx + 1] * densityRadScale, isBioflok ? 0.45 : 0.35, 1.72);
        const indSpeed = fishPhases[fIdx + 2];

        let fx = fishPos[fIdx];
        let fy = fishPos[fIdx + 1];
        let fz = fishPos[fIdx + 2];
        let vx = fishVel[fIdx];
        let vy = fishVel[fIdx + 1];
        let vz = fishVel[fIdx + 2];

        // Individual surface-feeding surge cycle inside feed burst
        const feedWave = isFeeding ? Math.sin(elapsed * 2.5 + phase * 1.9 + i * 0.7) : -1;
        const isSurgingToSurface = isFeeding && feedWave > 0.18;

        let targetVx = 0;
        let targetVy = 0;
        let targetVz = 0;

        if (isSurgingToSurface) {
          // Dart toward floating pellet & breach near water surface
          const pIdx = (i % MAX_PELLETS) * 3;
          const pX = pelletPos[pIdx];
          const pZ = pelletPos[pIdx + 2];
          const pY = waterY - 0.015;
          const dx = pX - fx;
          const dy = pY - fy;
          const dz = pZ - fz;
          const dist = Math.hypot(dx, dy, dz) + 0.001;
          const rushSpeed = (1.65 + indSpeed * 0.7) * 1.45;
          targetVx = (dx / dist) * rushSpeed;
          targetVy = (dy / dist) * rushSpeed * 1.25;
          targetVz = (dz / dist) * rushSpeed;

          if (fy > waterY - 0.048 && dist < 0.28 && splashRings[nextSplashCursor * 3 + 2] <= 0.05) {
            splashRings[nextSplashCursor * 3] = fx;
            splashRings[nextSplashCursor * 3 + 1] = fz;
            splashRings[nextSplashCursor * 3 + 2] = 0.95;
            nextSplashCursor = (nextSplashCursor + 1) % MAX_SPLASH_RINGS;
          }
        } else {
          // Schooling flow (orbital tangent + radial spring + density/time wander)
          const rHoriz = Math.hypot(fx, fz) + 0.001;
          const tangX = (-fz / rHoriz) * swirlDir;
          const tangZ = (fx / rHoriz) * swirlDir;
          const radialErr = baseRad - rHoriz;
          const wanderAng = elapsed * (0.9 + indSpeed * 0.4) + phase * 2.3;
          const schoolSpeed =
            indSpeed * timeSpeedMult * densitySpeedMult * (isFeeding ? 1.55 : 1.0);

          targetVx =
            tangX * schoolSpeed +
            (fx / rHoriz) * radialErr * 1.15 +
            Math.cos(wanderAng) * wanderAmp;
          targetVz =
            tangZ * schoolSpeed * 0.92 +
            (fz / rHoriz) * radialErr * 1.15 +
            Math.sin(wanderAng * 0.83) * wanderAmp;

          const strataY = ((i % 3) - 1) * strataSpread;
          const feedAnticipationY = isFeeding ? 0.08 : 0;
          const targetY =
            baseDepthY +
            strataY +
            feedAnticipationY +
            Math.sin(elapsed * 1.8 + phase) * 0.042;
          targetVy = (targetY - fy) * 2.6;
        }

        vx += (targetVx - vx) * smoothFactor;
        vy += (targetVy - vy) * smoothFactor;
        vz += (targetVz - vz) * smoothFactor;

        fx += vx * stepDt;
        fy += vy * stepDt;
        fz += vz * stepDt;

        // Enforce exact pond boundary walls & central bioflok standpipe clearance
        if (isBioflok) {
          const r = Math.hypot(fx, fz) + 0.0001;
          if (r > maxX) {
            fx = (fx / r) * maxX;
            fz = (fz / r) * maxX;
            vx *= -0.5;
            vz *= -0.5;
          } else if (r < 0.36) {
            fx = (fx / r) * 0.36;
            fz = (fz / r) * 0.36;
          }
        } else {
          if (fx > maxX) {
            fx = maxX;
            vx = -Math.abs(vx) * 0.6;
          } else if (fx < -maxX) {
            fx = -maxX;
            vx = Math.abs(vx) * 0.6;
          }
          if (fz > maxZ) {
            fz = maxZ;
            vz = -Math.abs(vz) * 0.6;
          } else if (fz < -maxZ) {
            fz = -maxZ;
            vz = Math.abs(vz) * 0.6;
          }
        }
        fy = clamp(fy, 0.24, waterY - 0.01);

        fishPos[fIdx] = fx;
        fishPos[fIdx + 1] = fy;
        fishPos[fIdx + 2] = fz;
        fishVel[fIdx] = vx;
        fishVel[fIdx + 1] = vy;
        fishVel[fIdx + 2] = vz;

        const horizSpeed = Math.hypot(vx, vz) + 0.001;
        const tailFreq = 6.5 + horizSpeed * 4.2;
        const tailWiggle = Math.sin(elapsed * tailFreq + i * 1.3) * 0.085;
        const yaw = Math.atan2(-vz, vx) + tailWiggle;
        const pitch = clamp(Math.atan2(vy, horizSpeed), -0.68, 0.68);
        const bankRoll = clamp((vx * targetVz - vz * targetVx) * 0.14, -0.25, 0.25);

        _dummy.position.set(fx, fy, fz);
        _dummy.rotation.set(bankRoll, yaw, pitch);
        _dummy.scale.setScalar(fishScale);
        _dummy.updateMatrix();
        fishMesh.setMatrixAt(i, _dummy.matrix);
      }
      fishMesh.instanceMatrix.needsUpdate = true;
    }
  };

  return {
    slotIndex,
    root,
    hitBox,
    lockedPlotGroup,
    emptyPlotGroup,
    slotKioskGroup,
    slotKioskPatio,
    slotKioskRoof,
    slotKioskSolar,
    slotKioskLanternMat,
    konvensionalGroup,
    bioflokGroup,
    rasGroup,
    edgeRocksGroup,
    aquaticVegGroup,
    waterMesh,
    waterMat,
    structureMaterials,
    bubbleMesh,
    canopyGroup,
    canopyTiers,
    aeratorGroup,
    aeratorRotors,
    aeratorLv2Parts,
    aeratorLv3Parts,
    aeratorLv4Parts,
    aeratorLv5Parts,
    autoFeederGroup,
    autoFeederArm,
    autoFeederLv2Parts,
    autoFeederLv3Parts,
    autoFeederLv4Parts,
    iotGroup,
    iotLedMat,
    iotLv2Parts,
    iotLv3Parts,
    iotLv4Parts,
    filterGroup,
    filterLv2Parts,
    filterLv3Parts,
    filterLv4Parts,
    filterLv5Parts,
    gradingGroup,
    gradingLv2Bar,
    gradingLv3Parts,
    gradingLv4Parts,
    futuristicGroup,
    holoRing,
    futuristicLv2Parts,
    futuristicLv3Parts,
    fishMesh,
    fishMat,
    fishPhases,
    pelletMesh,
    splashRingMesh,
    selectionRing,
    feedBurstState,
    syncFromState,
    animate,
  };
}

// --- KIOSK PLOT ASSEMBLY (Roadside Retail & Culinary Stalls) ---
export interface KioskPlotVisualHandle {
  root: THREE.Group;
  syncFromState: (plot: KioskPlotState | undefined) => void;
}

export function createKioskPlotAssembly(
  x: number,
  z: number,
  textures: ProceduralTextures
): KioskPlotVisualHandle {
  const root = new THREE.Group();
  root.position.set(x, 0, z);

  const woodMat = new THREE.MeshPhysicalMaterial({
    map: textures.wood,
    normalMap: textures.woodNormal,
    roughnessMap: textures.woodRoughness,
    roughness: 0.72,
    clearcoat: 0.14,
    envMapIntensity: 1.05,
  });
  const roofMat = new THREE.MeshPhysicalMaterial({
    map: textures.terracottaRoof,
    normalMap: textures.roofNormal,
    roughnessMap: textures.roofRoughness,
    roughness: 0.68,
    clearcoat: 0.18,
    envMapIntensity: 1.05,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    roughness: 0.08,
    ior: 1.5,
    reflectivity: 0.9,
    clearcoat: 0.95,
    transparent: true,
    opacity: 0.72,
    envMapIntensity: 1.4,
  });

  // Empty lot marker
  const emptyLot = new THREE.Group();
  const gravel = new THREE.Mesh(
    new THREE.BoxGeometry(3.8, 0.06, 2.8),
    new THREE.MeshStandardMaterial({
      map: textures.concrete,
      normalMap: textures.concreteNormal,
      color: 0x9ca3af,
      roughness: 0.92,
    })
  );
  gravel.position.y = 0.03;
  gravel.receiveShadow = true;
  const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), woodMat);
  stake.position.set(0, 0.37, 0);
  stake.castShadow = true;
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.4, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.55 })
  );
  sign.position.set(0, 0.72, 0);
  sign.castShadow = true;
  emptyLot.add(gravel, stake, sign);
  root.add(emptyLot);

  // Built Kiosk Group (scales/adds awning, dining bench, display tank by level & type)
  const builtGroup = new THREE.Group();
  builtGroup.add(createContactShadowPlane(textures.contactShadow, 4.4, 3.4, 0.38));

  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.14, 2.9), woodMat);
  deck.position.y = 0.07;
  deck.receiveShadow = true;
  deck.castShadow = true;
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.95, 0.75), woodMat);
  counter.position.set(0, 0.6, 0.45);
  counter.castShadow = true;
  counter.receiveShadow = true;
  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 2.0, 0.18),
    new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.8 })
  );
  backWall.position.set(0, 1.1, -0.95);
  backWall.castShadow = true;
  backWall.receiveShadow = true;

  const awningMat = new THREE.MeshPhysicalMaterial({
    color: 0xea580c,
    roughness: 0.48,
    clearcoat: 0.28,
    envMapIntensity: 1.1,
  });
  const awning = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 2.4), awningMat);
  awning.position.set(0, 2.25, 0.05);
  awning.rotation.x = 0.14;
  awning.castShadow = true;
  const awningTrim = new THREE.Mesh(new THREE.BoxGeometry(3.66, 0.12, 0.07), woodMat);
  awningTrim.position.set(0, 2.12, 1.24);
  awningTrim.castShadow = true;

  [
    [-1.68, -1.0],
    [1.68, -1.0],
    [-1.68, 1.18],
    [1.68, 1.18],
  ].forEach(([px, pz]) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 2.15, 8), woodMat);
    post.position.set(px, 1.15, pz);
    post.castShadow = true;
    builtGroup.add(post);
  });

  const displayTank = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.55), glassMat);
  displayTank.position.set(-0.95, 1.32, 0.45);
  const menuSign = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 0.52, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65 })
  );
  menuSign.position.set(0.85, 1.48, -0.84);

  const roofUpper = new THREE.Mesh(new THREE.ConeGeometry(2.3, 0.9, 4), roofMat);
  roofUpper.position.set(0, 2.75, -0.2);
  roofUpper.rotation.y = Math.PI / 4;
  roofUpper.castShadow = true;

  // Outdoor dining table & bench for level >= 2
  const patioGroup = new THREE.Group();
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.7), woodMat);
  table.position.set(0, 0.58, 1.45);
  table.castShadow = true;
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 0.3), woodMat);
  bench.position.set(0, 0.25, 1.88);
  bench.castShadow = true;
  patioGroup.add(table, bench);

  builtGroup.add(deck, counter, backWall, awning, awningTrim, displayTank, menuSign, roofUpper, patioGroup);
  attachOptionalGlbOverride(builtGroup, builtGroup, OPTIONAL_GLB_ASSETS.kioskPlot, {
    targetFootprint: 3.8,
  });
  root.add(builtGroup);

  const syncFromState = (plot: KioskPlotState | undefined) => {
    if (!plot) {
      root.visible = false;
      return;
    }
    root.visible = true;
    emptyLot.visible = !plot.built;
    builtGroup.visible = plot.built;
    if (plot.built) {
      patioGroup.visible = plot.level >= 2 || plot.businessType === 'warung_bakar' || plot.businessType === 'restoran_apung';
      roofUpper.visible = plot.level >= 2;
      const colorByType: Record<string, number> = {
        kios_segar: 0x0ea5e9,
        warung_bakar: 0xea580c,
        toko_pakan_pancing: 0x16a34a,
        paviliun_kuliner: 0x8b5cf6,
        restoran_apung: 0xd97706,
      };
      awningMat.color.setHex(colorByType[plot.businessType ?? 'kios_segar'] ?? 0xea580c);
    }
  };

  return { root, syncFromState };
}

// --- 8 INFRASTRUCTURE BUILDINGS ---
export interface InfrastructureVisualHandle {
  root: THREE.Group;
  syncFromInfra: (infra: InfraLevels) => void;
}

export function createFarmBuildings(textures: ProceduralTextures): InfrastructureVisualHandle {
  const root = new THREE.Group();

  const woodMat = new THREE.MeshPhysicalMaterial({
    map: textures.wood,
    normalMap: textures.woodNormal,
    roughnessMap: textures.woodRoughness,
    roughness: 0.74,
    clearcoat: 0.12,
    envMapIntensity: 1.05,
  });
  const wallMat = new THREE.MeshPhysicalMaterial({
    map: textures.concrete,
    normalMap: textures.concreteNormal,
    roughnessMap: textures.concreteRoughness,
    color: 0xf8fafc,
    roughness: 0.68,
    clearcoat: 0.14,
    envMapIntensity: 1.1,
  });
  const brickMat = new THREE.MeshPhysicalMaterial({
    map: textures.terracottaRoof,
    normalMap: textures.roofNormal,
    roughnessMap: textures.roofRoughness,
    color: 0xc2410c,
    roughness: 0.74,
    clearcoat: 0.12,
    envMapIntensity: 1.05,
  });
  const steelMat = new THREE.MeshPhysicalMaterial({
    color: 0x94a3b8,
    normalMap: textures.metalNormal,
    roughnessMap: textures.metalRoughness,
    roughness: 0.24,
    metalness: 0.88,
    anisotropy: 0.75,
    clearcoat: 0.42,
    envMapIntensity: 1.45,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    roughness: 0.08,
    metalness: 0.1,
    ior: 1.5,
    reflectivity: 0.92,
    clearcoat: 0.95,
    transparent: true,
    opacity: 0.72,
    envMapIntensity: 1.45,
  });
  const solarMat = new THREE.MeshPhysicalMaterial({
    map: textures.solarGrid,
    roughness: 0.18,
    metalness: 0.65,
    clearcoat: 0.85,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.4,
  });

  // 1. Kiosk Utama (16.5, 4.0)
  const kioskGroup = new THREE.Group();
  kioskGroup.position.set(16.5, 0, 4.0);
  kioskGroup.add(createContactShadowPlane(textures.contactShadow, 5.2, 4.2, 0.4));
  const kioskTiers: THREE.Group[] = [];
  for (let lvl = 1; lvl <= 5; lvl++) {
    const t = new THREE.Group();
    const w = 3.4 + lvl * 0.25;
    const h = 1.8 + lvl * 0.22;
    const d = 2.8 + lvl * 0.15;
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      lvl === 1 ? woodMat : lvl === 2 ? brickMat : wallMat
    );
    base.position.y = h / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    t.add(base);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.35, 0.12), woodMat);
    door.position.set(0, 0.68, d * 0.5 + 0.04);
    t.add(door);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(2.7 + lvl * 0.2, 1.0, 4),
      new THREE.MeshPhysicalMaterial({
        map: textures.terracottaRoof,
        normalMap: textures.roofNormal,
        color: lvl >= 4 ? 0x0284c7 : 0xb91c1c,
        roughness: 0.48,
        clearcoat: 0.24,
        envMapIntensity: 1.15,
      })
    );
    roof.position.y = 2.3 + lvl * 0.22;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    t.add(roof);
    kioskTiers.push(t);
    kioskGroup.add(t);
  }
  root.add(kioskGroup);

  // 2. Silo Pakan (16.5, -4.5)
  const siloGroup = new THREE.Group();
  siloGroup.position.set(16.5, 0, -4.5);
  siloGroup.add(createContactShadowPlane(textures.contactShadow, 4.8, 4.4, 0.4));
  const siloTiers: THREE.Group[] = [];
  for (let lvl = 1; lvl <= 5; lvl++) {
    const t = new THREE.Group();
    if (lvl === 1) {
      const shed = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.8, 2.4), woodMat);
      shed.position.y = 0.9;
      shed.castShadow = true;
      shed.receiveShadow = true;
      const shedRoof = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.2, 2.7), brickMat);
      shedRoof.position.y = 1.9;
      shedRoof.castShadow = true;
      t.add(shed, shedRoof);
    } else {
      const count = lvl >= 3 ? 2 : 1;
      for (let s = 0; s < count; s++) {
        const sx = count === 2 ? (s === 0 ? -1.05 : 1.05) : 0;
        const h = 2.4 + lvl * 0.4;
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, h, 18), steelMat);
        cyl.position.set(sx, h / 2, 0);
        cyl.castShadow = true;
        cyl.receiveShadow = true;
        const ringBand = new THREE.Mesh(new THREE.TorusGeometry(0.87, 0.035, 6, 18), steelMat);
        ringBand.rotation.x = Math.PI / 2;
        ringBand.position.set(sx, h * 0.55, 0);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.8, 18), steelMat);
        cone.position.set(sx, h + 0.4, 0);
        cone.castShadow = true;
        t.add(cyl, ringBand, cone);
      }
    }
    siloTiers.push(t);
    siloGroup.add(t);
  }
  root.add(siloGroup);

  // 3. Research Lab (-17.5, -5.5)
  const labGroup = new THREE.Group();
  labGroup.position.set(-17.5, 0, -5.5);
  labGroup.add(createContactShadowPlane(textures.contactShadow, 5.6, 5.0, 0.42));
  const labTiers: THREE.Group[] = [];
  for (let lvl = 1; lvl <= 5; lvl++) {
    const t = new THREE.Group();
    const h = 2.0 + lvl * 0.35;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(3.6 + lvl * 0.2, h, 3.0),
      lvl === 1 ? woodMat : wallMat
    );
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    t.add(body);
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.65, 3.06), glassMat);
    win.position.y = 1.3;
    t.add(win);
    if (lvl >= 3) {
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(1.3, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        lvl >= 4 ? glassMat : steelMat
      );
      dome.position.y = h;
      dome.castShadow = true;
      t.add(dome);
    }
    labTiers.push(t);
    labGroup.add(t);
  }
  root.add(labGroup);

  // 4. Power Station (-17.5, 3.5)
  const powerGroup = new THREE.Group();
  powerGroup.position.set(-17.5, 0, 3.5);
  powerGroup.add(createContactShadowPlane(textures.contactShadow, 5.0, 4.0, 0.38));
  const powerTiers: THREE.Group[] = [];
  for (let lvl = 1; lvl <= 4; lvl++) {
    const t = new THREE.Group();
    if (lvl === 1) {
      const gen = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 1.2, 1.2),
        new THREE.MeshPhysicalMaterial({
          color: 0xd97706,
          normalMap: textures.metalNormal,
          roughness: 0.4,
          metalness: 0.45,
          clearcoat: 0.3,
          envMapIntensity: 1.2,
        })
      );
      gen.position.y = 0.6;
      gen.castShadow = true;
      gen.receiveShadow = true;
      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.75, 8), steelMat);
      exhaust.position.set(0.65, 1.45, 0.3);
      exhaust.castShadow = true;
      t.add(gen, exhaust);
    } else {
      for (let r = -1; r <= 1; r += 2) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 1.3), solarMat);
        panel.position.set(0, 0.95, r * 0.9);
        panel.rotation.x = 0.4;
        panel.castShadow = true;
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.95, 6), steelMat);
        strut.position.set(0, 0.47, r * 0.9);
        strut.castShadow = true;
        t.add(panel, strut);
      }
      if (lvl >= 3) {
        const bat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, 1.4), wallMat);
        bat.position.set(-2.1, 0.75, 0);
        bat.castShadow = true;
        bat.receiveShadow = true;
        t.add(bat);
      }
    }
    powerTiers.push(t);
    powerGroup.add(t);
  }
  root.add(powerGroup);

  // 5. Water Treatment Plant / WTP Sungai (-17.5, 11.2)
  const wtpGroup = new THREE.Group();
  wtpGroup.position.set(-17.5, 0, 11.2);
  wtpGroup.add(createContactShadowPlane(textures.contactShadow, 4.4, 3.4, 0.35));
  const wtpTankMat = new THREE.MeshPhysicalMaterial({
    color: 0x0ea5e9,
    normalMap: textures.metalNormal,
    roughness: 0.28,
    metalness: 0.35,
    clearcoat: 0.55,
    envMapIntensity: 1.3,
  });
  const wtpTank1 = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.4, 16), wtpTankMat);
  wtpTank1.position.set(-0.9, 0.7, 0);
  wtpTank1.castShadow = true;
  wtpTank1.receiveShadow = true;
  const wtpTank2 = wtpTank1.clone();
  wtpTank2.position.set(0.9, 0.7, 0);
  const wtpPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 8), steelMat);
  wtpPipe.rotation.z = Math.PI / 2;
  wtpPipe.position.set(0, 1.2, 0);
  wtpPipe.castShadow = true;
  wtpGroup.add(wtpTank1, wtpTank2, wtpPipe);
  root.add(wtpGroup);

  // 6. Cold Storage (16.5, 8.8)
  const coldGroup = new THREE.Group();
  coldGroup.position.set(16.5, 0, 8.8);
  coldGroup.add(createContactShadowPlane(textures.contactShadow, 4.6, 3.6, 0.38));
  const coldBody = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.1, 2.6), wallMat);
  coldBody.position.y = 1.05;
  coldBody.castShadow = true;
  coldBody.receiveShadow = true;
  const coldStripe = new THREE.Mesh(
    new THREE.BoxGeometry(3.65, 0.25, 2.65),
    new THREE.MeshPhysicalMaterial({ color: 0x0284c7, roughness: 0.25, clearcoat: 0.5, envMapIntensity: 1.25 })
  );
  coldStripe.position.y = 1.85;
  const fanBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.4), steelMat);
  fanBox.position.set(0, 1.4, 1.4);
  fanBox.castShadow = true;
  coldGroup.add(coldBody, coldStripe, fanBox);
  root.add(coldGroup);

  // 7. Hatchery / Balai Pembenihan (-17.5, -11.5)
  const hatchGroup = new THREE.Group();
  hatchGroup.position.set(-17.5, 0, -11.5);
  hatchGroup.add(createContactShadowPlane(textures.contactShadow, 4.6, 3.6, 0.38));
  const hatchHouse = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.8, 2.6), glassMat);
  hatchHouse.position.y = 0.9;
  hatchHouse.castShadow = true;
  const hatchFrame = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.16, 2.7), steelMat);
  hatchFrame.position.y = 1.85;
  hatchFrame.castShadow = true;
  hatchGroup.add(hatchHouse, hatchFrame);
  root.add(hatchGroup);

  // 8. Logistics Truck & Dock (16.5, -9.8)
  const logGroup = new THREE.Group();
  logGroup.position.set(16.5, 0, -9.8);
  logGroup.add(createContactShadowPlane(textures.contactShadow, 4.8, 3.2, 0.4));
  const truckCargo = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 1.35, 1.45),
    new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      roughness: 0.34,
      clearcoat: 0.35,
      envMapIntensity: 1.2,
    })
  );
  truckCargo.position.set(-0.4, 1.05, 0);
  truckCargo.castShadow = true;
  truckCargo.receiveShadow = true;
  const truckCab = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 1.1, 1.4),
    new THREE.MeshPhysicalMaterial({
      color: 0x059669,
      roughness: 0.28,
      metalness: 0.25,
      clearcoat: 0.65,
      envMapIntensity: 1.3,
    })
  );
  truckCab.position.set(1.4, 0.92, 0);
  truckCab.castShadow = true;
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });
  [-1.1, 0.2, 1.3].forEach((wx) => {
    [-0.72, 0.72].forEach((wz) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.18, 12), wheelMat);
      w.rotation.x = Math.PI / 2;
      w.position.set(wx, 0.32, wz);
      w.castShadow = true;
      logGroup.add(w);
    });
  });
  logGroup.add(truckCargo, truckCab);
  root.add(logGroup);

  const syncFromInfra = (infra: InfraLevels) => {
    kioskTiers.forEach((t, idx) => (t.visible = infra.kiosk === idx + 1));
    siloTiers.forEach((t, idx) => (t.visible = infra.silo === idx + 1));
    labTiers.forEach((t, idx) => (t.visible = infra.researchLab === idx + 1));
    powerTiers.forEach((t, idx) => (t.visible = infra.power === idx + 1));
    wtpGroup.visible = infra.waterPlant > 0;
    coldGroup.visible = infra.coldStorage > 0;
    hatchGroup.visible = infra.hatchery > 0;
    logGroup.visible = infra.logistics > 0;
  };

  return { root, syncFromInfra };
}

// --- FEED TRANSPORT VEHICLE (Village Atmosphere) ---
export interface FeedTruckHandle {
  group: THREE.Group;
  wheels: THREE.Mesh[];
  headlightMat: THREE.MeshStandardMaterial;
  posX: number;
  dir: number;
  pauseTimer: number;
}

function createFeedTransportVehicle(textures: ProceduralTextures): FeedTruckHandle {
  const group = new THREE.Group();
  group.position.set(-14, 0, 13.0);
  group.add(createContactShadowPlane(textures.contactShadow, 4.2, 2.0, 0.44));

  const chassisMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
  const cabMat = new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.35, metalness: 0.25 });
  const flatbedMat = new THREE.MeshStandardMaterial({
    map: textures.wood,
    normalMap: textures.woodNormal,
    roughness: 0.8,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbae6fd,
    roughness: 0.08,
    clearcoat: 0.9,
    transparent: true,
    opacity: 0.72,
  });
  const sackMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.85 });
  const sackMat2 = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.85 });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xfde047,
    emissiveIntensity: 0.15,
  });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.2, 1.25), chassisMat);
  chassis.position.y = 0.42;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.05, 1.28), cabMat);
  cab.position.set(1.05, 0.96, 0);
  cab.castShadow = true;
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 1.1), glassMat);
  windshield.position.set(1.56, 1.12, 0);
  const flatbed = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.22, 1.34), flatbedMat);
  flatbed.position.set(-0.6, 0.62, 0);
  flatbed.castShadow = true;

  // Stacked Feed Sacks
  for (let i = 0; i < 6; i++) {
    const sack = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.28, 0.54),
      i % 2 === 0 ? sackMat : sackMat2
    );
    sack.position.set(-1.15 + (i % 3) * 0.56, 0.88 + Math.floor(i / 3) * 0.28, (i % 2 === 0 ? -0.3 : 0.3));
    sack.castShadow = true;
    group.add(sack);
  }

  const headL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.2), headlightMat);
  headL.position.set(1.59, 0.65, -0.44);
  const headR = headL.clone();
  headR.position.set(1.59, 0.65, 0.44);

  const wheels: THREE.Mesh[] = [];
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.88 });
  [-1.1, 1.05].forEach((wx) => {
    [-0.68, 0.68].forEach((wz) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 12), tireMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.3, wz);
      wheels.push(wheel);
      group.add(wheel);
    });
  });

  group.add(chassis, cab, windshield, flatbed, headL, headR);
  return {
    group,
    wheels,
    headlightMat,
    posX: -14,
    dir: 1,
    pauseTimer: 0,
  };
}

// --- VILLAGE SCENERY (Sculpted Terrain, Reflective River, Houses, Bridge, Trees, Reeds, Feed Truck) ---
export interface VillageSceneryHandle {
  root: THREE.Group;
  groundMat: THREE.MeshStandardMaterial;
  pathMat: THREE.MeshStandardMaterial;
  riverWater: Water;
  riverVegGroup: THREE.Group;
  treesGroup: THREE.Group;
  reedMat: THREE.MeshStandardMaterial;
  boatGroup: THREE.Group;
  feedTruck: FeedTruckHandle;
  lampBulbMats: THREE.MeshStandardMaterial[];
  houseWindowMats: THREE.MeshStandardMaterial[];
}

function terrainHeightAt(x: number, z: number): number {
  // Carve smooth river channel centered around z = 18.5
  const distRiver = Math.abs(z - 18.5);
  if (distRiver < 4.4 && Math.abs(x) < 95) {
    const t = clamp((4.4 - distRiver) / 2.2, 0, 1);
    const smooth = t * t * (3 - 2 * t);
    return -1.25 * smooth;
  }

  // Keep playable farm & village plaza terrace completely flat at y = 0
  const inPlayX = clamp((Math.abs(x) - 24) / 14, 0, 1);
  const inPlayZ = z < -17.5 ? clamp((-17.5 - z) / 14, 0, 1) : z > 30 ? clamp((z - 30) / 14, 0, 1) : 0;
  const edgeMask = Math.max(inPlayX, inPlayZ);
  if (edgeMask <= 0) return 0;

  const smoothMask = edgeMask * edgeMask * (3 - 2 * edgeMask);
  const ridge1 = Math.sin(x * 0.065 + 0.4) * Math.cos(z * 0.07 - 0.3) * 4.8;
  const ridge2 = Math.sin(x * 0.14 - z * 0.11) * 2.1;
  const baseRise = smoothMask * 4.2;
  return Math.max(0, (baseRise + ridge1 + ridge2) * smoothMask);
}

export function createEnvironmentScenery(
  textures: ProceduralTextures,
  isSoftwareGl: boolean
): VillageSceneryHandle {
  const root = new THREE.Group();

  // Sculpted 3D Valley Terrain with River Channel Depression & Horizon Foothills
  const groundGeo = new THREE.PlaneGeometry(220, 220, 96, 96);
  groundGeo.rotateX(-Math.PI / 2);
  const posAttr = groundGeo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);
  const colMeadow = new THREE.Color(0xa7d996);
  const colSlope = new THREE.Color(0x639453);
  const colPeak = new THREE.Color(0x526b5c);
  const colRiverBed = new THREE.Color(0x4b4434);
  const workCol = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const vy = terrainHeightAt(vx, vz);
    posAttr.setY(i, vy);

    if (vy < -0.08) {
      workCol.copy(colMeadow).lerp(colRiverBed, clamp(-vy / 1.1, 0, 1));
    } else if (vy > 0.4) {
      const tSlope = clamp(vy / 5.0, 0, 1);
      workCol.copy(colMeadow).lerp(colSlope, tSlope);
      if (vy > 6.0) {
        workCol.lerp(colPeak, clamp((vy - 6.0) / 5.5, 0, 0.75));
      }
    } else {
      workCol.copy(colMeadow);
    }
    colors[i * 3] = workCol.r;
    colors[i * 3 + 1] = workCol.g;
    colors[i * 3 + 2] = workCol.b;
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({
    map: textures.grass,
    normalMap: textures.grassNormal,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: textures.grassRoughness,
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.92,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  root.add(ground);

  // Village Road & Stone Footpaths with Roughness & Normal Maps
  const pathMat = new THREE.MeshStandardMaterial({
    map: textures.stonePath,
    normalMap: textures.stoneNormal,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughnessMap: textures.stoneRoughness,
    roughness: 0.86,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const roadMain = new THREE.Mesh(new THREE.PlaneGeometry(42, 2.8), pathMat);
  roadMain.rotation.x = -Math.PI / 2;
  roadMain.position.set(0, 0.025, 13.0);
  roadMain.receiveShadow = true;

  const centralPath = new THREE.Mesh(new THREE.PlaneGeometry(34, 1.8), pathMat);
  centralPath.rotation.x = -Math.PI / 2;
  centralPath.position.set(-0.5, 0.02, -5.4);
  centralPath.receiveShadow = true;

  const midPath = new THREE.Mesh(new THREE.PlaneGeometry(34, 1.8), pathMat);
  midPath.rotation.x = -Math.PI / 2;
  midPath.position.set(-0.5, 0.02, 1.8);
  midPath.receiveShadow = true;

  const sidePathR = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 24), pathMat);
  sidePathR.rotation.x = -Math.PI / 2;
  sidePathR.position.set(13.8, 0.024, 1.0);
  sidePathR.receiveShadow = true;
  root.add(roadMain, centralPath, midPath, sidePathR);

  // Real-Time Planar Reflection River (`Water`)
  const riverGeo = new THREE.PlaneGeometry(190, 7.8);
  const riverWater = new Water(riverGeo, {
    textureWidth: isSoftwareGl ? 128 : 512,
    textureHeight: isSoftwareGl ? 128 : 512,
    waterNormals: textures.waterNormals,
    sunDirection: new THREE.Vector3(0.5, 0.7, 0.3).normalize(),
    sunColor: 0xfff7ea,
    waterColor: 0x165c78,
    distortionScale: 1.75,
    fog: true,
  });
  riverWater.rotation.x = -Math.PI / 2;
  riverWater.position.set(0, 0.04, 18.5);
  riverWater.material.uniforms['size'].value = 2.6;

  // Keep linear HDR output when EffectComposer + OutputPass handles tone mapping on GPU
  if (!isSoftwareGl) {
    riverWater.material.fragmentShader = riverWater.material.fragmentShader
      .replace('#include <tonemapping_fragment>', '')
      .replace('#include <colorspace_fragment>', '');
    riverWater.material.needsUpdate = true;
  }

  // Guard planar mirror render against GTAOPass G-buffer scene.overrideMaterial sweeps
  const origWaterBeforeRender = riverWater.onBeforeRender;
  riverWater.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
    if (scene.overrideMaterial !== null) return;
    origWaterBeforeRender.call(this, renderer, scene, camera, geometry, material, group);
  };
  root.add(riverWater);

  const bankMat = new THREE.MeshStandardMaterial({
    map: textures.concrete,
    normalMap: textures.concreteNormal,
    roughnessMap: textures.concreteRoughness,
    color: 0x7c6a50,
    roughness: 0.9,
  });
  const bankN = new THREE.Mesh(new THREE.BoxGeometry(190, 0.34, 1.15), bankMat);
  bankN.position.set(0, 0.05, 14.35);
  bankN.receiveShadow = true;
  const bankS = bankN.clone();
  bankS.position.set(0, 0.05, 22.65);
  root.add(bankN, bankS);

  // River Stones along banks (sculpted organic boulders + pebbles)
  const boulderMat = new THREE.MeshPhysicalMaterial({
    map: textures.concrete,
    normalMap: textures.stoneNormal,
    roughnessMap: textures.stoneRoughness,
    color: 0x64748b,
    roughness: 0.88,
    clearcoat: 0.14,
  });
  const riverBoulderGeo = createOrganicRockGeometry(7.7, 0.52, 1);
  [-22, -14, -6, 4, 11, 18, 25].forEach((bx, idx) => {
    const stone = new THREE.Mesh(riverBoulderGeo, boulderMat);
    stone.position.set(bx, 0.12, idx % 2 === 0 ? 14.8 : 22.1);
    stone.scale.set(1.25, 0.72, 1.05);
    stone.rotation.y = idx * 0.9;
    stone.castShadow = true;
    stone.receiveShadow = true;
    root.add(stone);
  });

  // Riverbank Floating Teratai & Eceng Gondok Clusters along calm margins
  const riverVegGroup = new THREE.Group();
  const riverVegGeos = createAquaticSharedGeometries();
  const riverVegMats: AquaticPlantMaterials = {
    padMat: new THREE.MeshPhysicalMaterial({ color: 0x2f8541, roughness: 0.34, clearcoat: 0.5 }),
    padDarkMat: new THREE.MeshPhysicalMaterial({ color: 0x226835, roughness: 0.38, clearcoat: 0.45 }),
    petalPinkMat: new THREE.MeshPhysicalMaterial({ color: 0xf472b6, roughness: 0.42, clearcoat: 0.32 }),
    petalCreamMat: new THREE.MeshPhysicalMaterial({ color: 0xfdf2f8, roughness: 0.4, clearcoat: 0.34 }),
    stamenMat: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.48 }),
    bulbMat: new THREE.MeshPhysicalMaterial({ color: 0x65a30d, roughness: 0.36, clearcoat: 0.45 }),
    leafMat: new THREE.MeshPhysicalMaterial({ color: 0x22a648, roughness: 0.28, clearcoat: 0.6 }),
    flowerVioletMat: new THREE.MeshPhysicalMaterial({ color: 0xa855f7, roughness: 0.38, clearcoat: 0.3 }),
    rootMat: new THREE.MeshStandardMaterial({ color: 0x3a3322, roughness: 0.92 }),
  };
  const riverVegCoords: Array<[number, number, 'teratai' | 'eceng' | 'mixed']> = [
    [-21.5, 15.45, 'eceng'],
    [-16.2, 15.6, 'teratai'],
    [-10.8, 15.35, 'mixed'],
    [-5.6, 15.5, 'eceng'],
    [4.4, 15.55, 'teratai'],
    [9.8, 15.4, 'eceng'],
    [15.4, 15.55, 'mixed'],
    [-19.5, 21.45, 'teratai'],
    [-13.4, 21.6, 'eceng'],
    [-7.4, 21.4, 'mixed'],
    [3.8, 21.55, 'eceng'],
    [10.2, 21.45, 'teratai'],
    [17.2, 21.5, 'mixed'],
  ];
  riverVegCoords.forEach(([vx, vz, kind], idx) => {
    const cluster = createAquaticVegetationCluster(kind, riverVegMats, riverVegGeos, idx + 10);
    cluster.position.set(vx, 0.055, vz);
    cluster.scale.setScalar(1.2 + (idx % 3) * 0.18);
    cluster.userData.phase = idx * 1.15;
    riverVegGroup.add(cluster);
  });
  root.add(riverVegGroup);

  // Wind-Animated Riverside Reeds & Grass Tufts (InstancedMesh + GLSL Vertex Wind)
  const reedGeo = new THREE.ConeGeometry(0.06, 0.9, 5);
  reedGeo.translate(0, 0.45, 0);
  const reedMat = new THREE.MeshStandardMaterial({ color: 0x4d7c3f, roughness: 0.85 });
  reedMat.userData.uTime = { value: 0 };
  reedMat.userData.uWind = { value: 0.06 };
  reedMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = reedMat.userData.uTime;
    shader.uniforms.uWind = reedMat.userData.uWind;
    shader.vertexShader =
      `uniform float uTime;\nuniform float uWind;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        float hFactor = clamp(position.y, 0.0, 1.0);
        transformed.x += sin(uTime * 2.4 + float(gl_InstanceID) * 0.7) * uWind * hFactor * hFactor;
        transformed.z += cos(uTime * 1.9 + float(gl_InstanceID) * 0.5) * uWind * 0.6 * hFactor * hFactor;
        `
      );
  };
  const REED_COUNT = 160;
  const reedMesh = new THREE.InstancedMesh(reedGeo, reedMat, REED_COUNT);
  for (let i = 0; i < REED_COUNT; i++) {
    const side = i % 2 === 0 ? 14.7 : 22.2;
    const rx = ((i * 7.3) % 58) - 29 + Math.sin(i * 1.9) * 0.8;
    const rz = side + Math.cos(i * 2.7) * 0.35;
    if (Math.abs(rx + 0.4) < 2.5) {
      _dummy.scale.setScalar(0.001);
    } else {
      _dummy.scale.set(0.8 + (i % 4) * 0.15, 0.7 + (i % 5) * 0.22, 0.8 + (i % 3) * 0.15);
    }
    _dummy.position.set(rx, -0.05, rz);
    _dummy.rotation.set((i % 3 - 1) * 0.08, i * 1.1, (i % 5 - 2) * 0.06);
    _dummy.updateMatrix();
    reedMesh.setMatrixAt(i, _dummy.matrix);
    _color.setHex(i % 3 === 0 ? 0x3f6e33 : i % 3 === 1 ? 0x558c44 : 0x6ba04f);
    reedMesh.setColorAt(i, _color);
  }
  reedMesh.instanceMatrix.needsUpdate = true;
  if (reedMesh.instanceColor) reedMesh.instanceColor.needsUpdate = true;
  reedMesh.computeBoundingSphere();
  root.add(reedMesh);

  // Wooden Bridge over River with Submerged Pilings & Balusters
  const woodMat = new THREE.MeshStandardMaterial({
    map: textures.wood,
    normalMap: textures.woodNormal,
    roughnessMap: textures.woodRoughness,
    roughness: 0.78,
  });
  const bridge = new THREE.Group();
  bridge.position.set(-0.4, 0, 18.5);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, 9.6), woodMat);
  deck.position.y = 0.48;
  deck.castShadow = true;
  deck.receiveShadow = true;
  bridge.add(deck);
  [-1.55, 1.55].forEach((rx) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 9.6), woodMat);
    rail.position.set(rx, 1.16, 0);
    rail.castShadow = true;
    bridge.add(rail);
    [-4.2, -2.1, 0, 2.1, 4.2].forEach((pz) => {
      const baluster = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.68, 0.1), woodMat);
      baluster.position.set(rx, 0.82, pz);
      bridge.add(baluster);
      // Submerged piling down to riverbed
      const piling = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.85, 8), woodMat);
      piling.position.set(rx, -0.35, pz);
      piling.castShadow = true;
      bridge.add(piling);
    });
  });
  root.add(bridge);

  // Animated Wooden Fishing Sampan Boat on the River
  const boatGroup = new THREE.Group();
  boatGroup.position.set(-12, 0.18, 18.5);
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.38, 1.05),
    new THREE.MeshStandardMaterial({
      map: textures.wood,
      normalMap: textures.woodNormal,
      color: 0x854d0e,
      roughness: 0.75,
    })
  );
  hull.castShadow = true;
  const bow = new THREE.Mesh(
    new THREE.ConeGeometry(0.65, 1.0, 4),
    new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.78 })
  );
  bow.rotation.z = -Math.PI / 2;
  bow.rotation.x = Math.PI / 4;
  bow.position.set(2.0, 0.05, 0);
  const cabinRoof = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.1, 0.95),
    new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.55 })
  );
  cabinRoof.position.set(-0.3, 0.9, 0);
  cabinRoof.castShadow = true;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), woodMat);
  mast.position.set(-0.3, 0.45, 0);
  boatGroup.add(hull, bow, cabinRoof, mast);
  root.add(boatGroup);

  // Feed Transport Truck on Village Road
  const feedTruck = createFeedTransportVehicle(textures);
  root.add(feedTruck.group);

  // Village Houses (Rumah Kampung + Stone Plinth + Timber Pilasters + Veranda) across the river & flanks
  const houseWindowMats: THREE.MeshStandardMaterial[] = [];
  const roofTexMat = new THREE.MeshPhysicalMaterial({
    map: textures.terracottaRoof,
    normalMap: textures.roofNormal,
    roughnessMap: textures.roofRoughness,
    roughness: 0.68,
    clearcoat: 0.18,
    envMapIntensity: 1.05,
  });
  const plasterMat = new THREE.MeshStandardMaterial({ color: 0xfef9c3, roughness: 0.82 });
  const plasterMat2 = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, roughness: 0.82 });

  const houseCoords: Array<[number, number, number]> = [
    [-21, 25.5, 0],
    [-11, 26.0, 0.15],
    [8, 25.8, -0.1],
    [19, 26.5, -0.2],
    [-24, 9.0, Math.PI / 2],
    [24, 9.5, -Math.PI / 2],
  ];

  houseCoords.forEach(([hx, hz, rot], idx) => {
    const h = new THREE.Group();
    h.position.set(hx, 0, hz);
    h.rotation.y = rot;
    h.add(createContactShadowPlane(textures.contactShadow, 5.6, 4.8, 0.42));

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.24, 3.7), bankMat);
    plinth.position.y = 0.12;
    plinth.receiveShadow = true;

    const frontStep = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 0.65), bankMat);
    frontStep.position.set(0, 0.07, 2.05);
    frontStep.receiveShadow = true;

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 2.2, 3.4),
      idx % 2 === 0 ? plasterMat : plasterMat2
    );
    body.position.y = 1.32;
    body.castShadow = true;
    body.receiveShadow = true;

    // Corner timber pilasters
    [
      [-2.08, -1.68],
      [2.08, -1.68],
      [-2.08, 1.68],
      [2.08, 1.68],
    ].forEach(([cx, cz]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.24, 0.14), woodMat);
      post.position.set(cx, 1.32, cz);
      post.castShadow = true;
      h.add(post);
    });

    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.65, 4), roofTexMat);
    roof.position.y = 3.22;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;

    const porch = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.12, 1.15), woodMat);
    porch.position.set(0, 1.98, 2.18);
    porch.rotation.x = 0.18;
    porch.castShadow = true;

    const winMat = new THREE.MeshStandardMaterial({
      color: 0xfde68a,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.1,
    });
    houseWindowMats.push(winMat);
    const win1 = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.7, 0.12), winMat);
    win1.position.set(-1.1, 1.45, 1.72);
    const winFrame1 = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.82, 0.07), woodMat);
    winFrame1.position.set(-1.1, 1.45, 1.7);
    const win2 = win1.clone();
    win2.position.set(1.1, 1.45, 1.72);
    const winFrame2 = winFrame1.clone();
    winFrame2.position.set(1.1, 1.45, 1.7);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.5, 0.12), woodMat);
    door.position.set(0, 0.97, 1.72);

    h.add(plinth, frontStep, body, roof, porch, winFrame1, winFrame2, win1, win2, door);
    attachOptionalGlbOverride(h, h, OPTIONAL_GLB_ASSETS.villageHouse, { targetFootprint: 4.5 });
    root.add(h);
  });

  // Village Gazebo / Saung near river bank (-17, 14.2)
  const saung = new THREE.Group();
  saung.position.set(-17, 0, 14.2);
  const sFloor = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 2.6), woodMat);
  sFloor.position.y = 0.15;
  sFloor.castShadow = true;
  sFloor.receiveShadow = true;
  const sRoof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.15, 4), roofTexMat);
  sRoof.position.y = 2.48;
  sRoof.rotation.y = Math.PI / 4;
  sRoof.castShadow = true;
  saung.add(sFloor, sRoof);
  [
    [-1.1, -1.1],
    [1.1, -1.1],
    [-1.1, 1.1],
    [1.1, 1.1],
  ].forEach(([px, pz]) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.0, 6), woodMat);
    p.position.set(px, 1.0, pz);
    p.castShadow = true;
    saung.add(p);
  });
  root.add(saung);

  // Street Lamps along Village Road
  const lampBulbMats: THREE.MeshStandardMaterial[] = [];
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.38, metalness: 0.75 });
  [-15, -7, 1, 9, 17].forEach((lx) => {
    const lamp = new THREE.Group();
    lamp.position.set(lx, 0, 14.1);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 8), poleMat);
    pole.position.y = 1.6;
    pole.castShadow = true;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.6), poleMat);
    arm.position.set(0, 3.15, -0.25);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfbbf24,
      emissiveIntensity: 0.1,
    });
    lampBulbMats.push(bulbMat);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), bulbMat);
    bulb.position.set(0, 3.05, -0.5);
    lamp.add(pole, arm, bulb);
    root.add(lamp);
  });

  // Photorealistic Multi-Part Village Trees (Lathed Flared Trunk + Branches + Layered Foliage)
  const treesGroup = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({
    map: textures.bark,
    normalMap: textures.barkNormal,
    roughnessMap: textures.barkRoughness,
    roughness: 0.9,
  });
  const trunkPoints = [
    new THREE.Vector2(0.42, 0),
    new THREE.Vector2(0.31, 0.35),
    new THREE.Vector2(0.24, 1.35),
    new THREE.Vector2(0.18, 2.35),
  ];
  const trunkLatheGeo = new THREE.LatheGeometry(trunkPoints, 10);
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: 0x2d6a3e, roughness: 0.82 }),
    new THREE.MeshStandardMaterial({ color: 0x3b8449, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x4b934f, roughness: 0.78 }),
  ];

  const treeCoords: Array<[number, number, number]> = [
    [-25, -18, 1.15],
    [-16, -18, 1.0],
    [-7, -17, 1.25],
    [2, -18, 1.05],
    [11, -17, 1.15],
    [21, -16, 1.3],
    [25, -5, 1.05],
    [24, 5, 1.15],
    [-26, -5, 1.2],
    [-25, 6, 1.0],
    [-26, 25, 1.2],
    [-4, 26, 1.1],
    [14, 26, 1.25],
    [26, 25, 1.15],
    [-33, -24, 1.4],
    [32, -22, 1.35],
  ];

  treeCoords.forEach(([tx, tz, sc], idx) => {
    const t = new THREE.Group();
    const baseY = terrainHeightAt(tx, tz);
    t.position.set(tx, baseY, tz);
    t.scale.setScalar(sc);
    t.rotation.y = idx * 1.15;
    t.add(createContactShadowPlane(textures.contactShadow, 3.6, 3.6, 0.38));

    const trunk = new THREE.Mesh(trunkLatheGeo, trunkMat);
    trunk.castShadow = true;
    trunk.receiveShadow = true;

    const branch1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 1.25, 7), trunkMat);
    branch1.position.set(0.38, 2.25, 0.15);
    branch1.rotation.z = -0.58;
    branch1.castShadow = true;

    const branch2 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 1.15, 7), trunkMat);
    branch2.position.set(-0.34, 2.15, -0.2);
    branch2.rotation.z = 0.55;
    branch2.rotation.x = -0.25;
    branch2.castShadow = true;

    const cMain = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.38, 2),
      leafMats[idx % leafMats.length]
    );
    cMain.position.set(0, 3.05, 0);
    cMain.scale.set(1.12, 0.85, 1.05);
    cMain.castShadow = true;

    const c2 = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.98, 2),
      leafMats[(idx + 1) % leafMats.length]
    );
    c2.position.set(0.75, 2.6, 0.42);
    c2.scale.set(1.05, 0.82, 1.0);
    c2.castShadow = true;

    const c3 = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.92, 2),
      leafMats[(idx + 2) % leafMats.length]
    );
    c3.position.set(-0.72, 2.55, -0.38);
    c3.castShadow = true;

    const cTop = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.84, 2),
      leafMats[(idx + 1) % leafMats.length]
    );
    cTop.position.set(0.08, 3.65, -0.1);
    cTop.castShadow = true;

    t.add(trunk, branch1, branch2, cMain, c2, c3, cTop);
    treesGroup.add(t);
  });
  root.add(treesGroup);

  return {
    root,
    groundMat,
    pathMat,
    riverWater,
    riverVegGroup,
    treesGroup,
    reedMat,
    boatGroup,
    feedTruck,
    lampBulbMats,
    houseWindowMats,
  };
}

// --- NPC ACTORS WITH REALISTIC ROLES & CONTEXTUAL SPEECH BUBBLES ---
export interface NpcActor {
  id: string;
  name: string;
  role: string;
  staffOrResearcherId?: string; // If tied to hireable staff/researcher, or always active villager
  group: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  waypoints: THREE.Vector3[];
  currentIdx: number;
  speed: number;
  pauseTimer: number;
  speechLines: string[];
  currentLineIndex: number;
  speechTimer: number;
}

export function createNpcActors(textures: ProceduralTextures): NpcActor[] {
  const configs: Array<{
    id: string;
    name: string;
    role: string;
    staffOrResearcherId?: string;
    shirt: number;
    hat: number;
    waypoints: THREE.Vector3[];
    speed: number;
    speechLines: string[];
  }> = [
    {
      id: 'npc_budi',
      name: 'Kang Budi',
      role: 'Pengurus Kolam',
      shirt: 0x0ea5e9,
      hat: 0xfef08a,
      waypoints: [
        new THREE.Vector3(13.5, 0, -4.0),
        new THREE.Vector3(6.5, 0, -5.4),
        new THREE.Vector3(-7.5, 0, -5.4),
        new THREE.Vector3(-7.5, 0, 1.8),
        new THREE.Vector3(6.5, 0, 1.8),
      ],
      speed: 2.0,
      speechLines: [
        'Ikan sudah diberi makan sesuai jadwal!',
        'Cek aerator kolam agar oksigen stabil.',
        'Pertumbuhan Lele minggu ini cepat sekali.',
        'Stok pelet di silo masih aman terkendali.',
      ],
    },
    {
      id: 'npc_sari',
      name: 'Teh Sari',
      role: 'Teknisi Air',
      shirt: 0x10b981,
      hat: 0xffffff,
      waypoints: [
        new THREE.Vector3(-13.5, 0, -5.0),
        new THREE.Vector3(-4.0, 0, 1.8),
        new THREE.Vector3(10.0, 0, 1.8),
        new THREE.Vector3(10.0, 0, -5.4),
      ],
      speed: 1.85,
      speechLines: [
        'Kadar DO terpantau sehat > 5.0 mg/L.',
        'pH air stabil di angka 7.1, aman!',
        'Amonia terjaga rendah berkat sirkulasi.',
        'Saat hujan deras, perhatikan atap peneduh.',
      ],
    },
    {
      id: 'npc_rina',
      name: 'Dr. Rina',
      role: 'Peneliti Lab',
      staffOrResearcherId: 'res_rina',
      shirt: 0xf8fafc,
      hat: 0x38bdf8,
      waypoints: [
        new THREE.Vector3(-15.5, 0, -4.5),
        new THREE.Vector3(-11.0, 0, -5.4),
        new THREE.Vector3(-4.0, 0, -5.4),
        new THREE.Vector3(-15.5, 0, 2.0),
      ],
      speed: 1.65,
      speechLines: [
        'Formula probiotik baru efektif turunkan amonia.',
        'Riset nutrisi memangkas FCR kolam!',
        'Sampel air Bioflok menunjukkan flok sehat.',
      ],
    },
    {
      id: 'npc_joko',
      name: 'Pak Joko',
      role: 'Pedagang Kios',
      shirt: 0xf59e0b,
      hat: 0x78350f,
      waypoints: [
        new THREE.Vector3(13.0, 0, 4.5),
        new THREE.Vector3(6.0, 0, 12.8),
        new THREE.Vector3(-6.0, 0, 12.8),
        new THREE.Vector3(-12.0, 0, 12.8),
      ],
      speed: 1.7,
      speechLines: [
        'Kios ikan bakar ramai pelanggan hari ini!',
        'Ikan segar langsung dari kolam laris manis!',
        'Pelanggan restoran suka Nila Merah ukuran seragam.',
      ],
    },
    {
      id: 'npc_warga1',
      name: 'Bu Wati',
      role: 'Warga Desa',
      shirt: 0xec4899,
      hat: 0xfde047,
      waypoints: [
        new THREE.Vector3(-16.0, 0, 13.0),
        new THREE.Vector3(-6.2, 0, 12.6),
        new THREE.Vector3(-0.4, 0, 13.2),
        new THREE.Vector3(-0.4, 0, 23.0),
        new THREE.Vector3(-10.0, 0, 24.5),
      ],
      speed: 1.45,
      speechLines: [
        'Beli ikan segar di kios tambak yuk!',
        'Desa kita makin maju sejak ada tambak modern.',
        'Suasana sungai sore ini sejuk sekali.',
      ],
    },
    {
      id: 'npc_warga2',
      name: 'Pak Darto',
      role: 'Nelayan Sungai',
      shirt: 0x6366f1,
      hat: 0xd97706,
      waypoints: [
        new THREE.Vector3(14.0, 0, 13.4),
        new THREE.Vector3(5.0, 0, 13.2),
        new THREE.Vector3(-0.4, 0, 15.0),
        new THREE.Vector3(5.0, 0, 13.2),
      ],
      speed: 1.5,
      speechLines: [
        'Perahu angkut siap kirim hasil panen!',
        'Air sungai mengalir lancar ke WTP tambak.',
        'Semoga panen raya bulan ini untung besar!',
      ],
    },
    {
      id: 'npc_warga3',
      name: 'Ibu Ani',
      role: 'Warga Desa',
      shirt: 0x14b8a6,
      hat: 0xfef9c3,
      waypoints: [
        new THREE.Vector3(-11.0, 0, 24.5),
        new THREE.Vector3(-0.4, 0, 23.5),
        new THREE.Vector3(-0.4, 0, 13.4),
        new THREE.Vector3(-12.0, 0, 13.2),
      ],
      speed: 1.38,
      speechLines: [
        'Jalur jalan desa kini makin rapi dan asri.',
        'Truk pakan rutin memasok ke gudang tambak!',
        'Kios ikan segar di area tambak selalu ramai.',
      ],
    },
    {
      id: 'npc_warga4',
      name: 'Pak Tono',
      role: 'Pembeli Kios',
      shirt: 0xf43f5e,
      hat: 0xe2e8f0,
      waypoints: [
        new THREE.Vector3(17.5, 0, 24.5),
        new THREE.Vector3(8.0, 0, 24.2),
        new THREE.Vector3(-0.4, 0, 22.8),
        new THREE.Vector3(-0.4, 0, 13.4),
        new THREE.Vector3(8.0, 0, 13.2),
      ],
      speed: 1.48,
      speechLines: [
        'Saya pesan 10 kg Nila Merah untuk acara desa.',
        'Kualitas ikan dari tambak ini paling segar!',
        'Suka melihat suasana desa yang damai ini.',
      ],
    },
  ];

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe6b89c, roughness: 0.7 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });

  return configs.map((cfg, idx) => {
    const group = new THREE.Group();
    group.position.copy(cfg.waypoints[0]);
    group.add(createContactShadowPlane(textures.contactShadow, 0.9, 0.9, 0.35));

    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.25, 0.65, 10),
      new THREE.MeshStandardMaterial({ color: cfg.shirt, roughness: 0.7 })
    );
    torso.position.y = 0.85;
    torso.castShadow = true;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 10), skinMat);
    head.position.y = 1.38;
    head.castShadow = true;

    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.29, 0.16, 12),
      new THREE.MeshStandardMaterial({ color: cfg.hat, roughness: 0.75 })
    );
    hat.position.y = 1.56;

    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.5, 0.14), pantsMat);
    leftLeg.position.set(-0.1, 0.28, 0);
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.5, 0.14), pantsMat);
    rightLeg.position.set(0.1, 0.28, 0);

    group.add(torso, head, hat, leftLeg, rightLeg);

    return {
      id: cfg.id,
      name: cfg.name,
      role: cfg.role,
      staffOrResearcherId: cfg.staffOrResearcherId,
      group,
      leftLeg,
      rightLeg,
      waypoints: cfg.waypoints,
      currentIdx: 1,
      speed: cfg.speed,
      pauseTimer: idx * 0.6,
      speechLines: cfg.speechLines,
      currentLineIndex: idx % cfg.speechLines.length,
      speechTimer: 2 + idx * 1.4,
    };
  });
}

export function pickContextualSpeech(npc: NpcActor, weather: WeatherType): string {
  if (weather === 'Hujan Deras' && Math.random() < 0.35) {
    return 'Hujan deras! Pastikan saluran drainase kolam lancar.';
  }
  if (weather === 'Panas Terik' && Math.random() < 0.35) {
    return 'Cuaca terik, atap peneduh & kincir sangat membantu ikan.';
  }
  return npc.speechLines[npc.currentLineIndex % npc.speechLines.length];
}
