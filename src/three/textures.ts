import * as THREE from 'three';

export interface ProceduralTextures {
  grass: THREE.CanvasTexture;
  grassNormal: THREE.CanvasTexture;
  grassRoughness: THREE.CanvasTexture;
  wood: THREE.CanvasTexture;
  woodNormal: THREE.CanvasTexture;
  woodRoughness: THREE.CanvasTexture;
  stonePath: THREE.CanvasTexture;
  stoneNormal: THREE.CanvasTexture;
  stoneRoughness: THREE.CanvasTexture;
  waterCaustics: THREE.CanvasTexture;
  waterKonvensional: THREE.CanvasTexture;
  waterBioflok: THREE.CanvasTexture;
  waterRas: THREE.CanvasTexture;
  waterNormals: THREE.CanvasTexture;
  solarGrid: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  metalCorrugated: THREE.CanvasTexture;
  metalNormal: THREE.CanvasTexture;
  metalRoughness: THREE.CanvasTexture;
  pvcNormal: THREE.CanvasTexture;
  pvcRoughness: THREE.CanvasTexture;
  terpalHdpe: THREE.CanvasTexture;
  terpalNormal: THREE.CanvasTexture;
  terpalRoughness: THREE.CanvasTexture;
  concrete: THREE.CanvasTexture;
  concreteNormal: THREE.CanvasTexture;
  concreteRoughness: THREE.CanvasTexture;
  terracottaRoof: THREE.CanvasTexture;
  roofNormal: THREE.CanvasTexture;
  roofRoughness: THREE.CanvasTexture;
  galvanizedMesh: THREE.CanvasTexture;
  galvanizedNormal: THREE.CanvasTexture;
  galvanizedRoughness: THREE.CanvasTexture;
  earth: THREE.CanvasTexture;
  earthNormal: THREE.CanvasTexture;
  earthRoughness: THREE.CanvasTexture;
  bamboo: THREE.CanvasTexture;
  bambooNormal: THREE.CanvasTexture;
  bark: THREE.CanvasTexture;
  barkNormal: THREE.CanvasTexture;
  barkRoughness: THREE.CanvasTexture;
  disposeAll: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function configureColorTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function configureDataTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

// Fast deterministic tileable hash + value noise for organic PBR heightmaps
function hash2(ix: number, iy: number, period: number, seed: number): number {
  const x = ((ix % period) + period) % period;
  const y = ((iy % period) + period) % period;
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function tileableNoise(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash2(ix, iy, period, seed);
  const n10 = hash2(ix + 1, iy, period, seed);
  const n01 = hash2(ix, iy + 1, period, seed);
  const n11 = hash2(ix + 1, iy + 1, period, seed);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function tileableFbm(u: number, v: number, baseFreq: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = baseFreq;
  for (let o = 0; o < octaves; o++) {
    sum += tileableNoise(u, v, freq, seed + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function buildNormalTextureFromHeight(
  size: number,
  heightFn: (u: number, v: number) => number,
  strength: number,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(size, size);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      heights[y * size + x] = heightFn(x / size, v);
    }
  }
  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = (heights[y * size + xp] - heights[y * size + xm]) * strength;
      const dy = (heights[yp * size + x] - heights[ym * size + x]) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const nx = -dx / len;
      const ny = -dy / len;
      const nz = 1 / len;
      const idx = (y * size + x) * 4;
      data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return configureDataTexture(canvas, repeatX, repeatY, maxAnisotropy);
}

function buildRoughnessTexture(
  size: number,
  roughFn: (u: number, v: number) => number,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const val = Math.max(0.06, Math.min(0.98, roughFn(x / size, v)));
      const byte = Math.round(val * 255);
      const idx = (y * size + x) * 4;
      data[idx] = byte;
      data[idx + 1] = byte;
      data[idx + 2] = byte;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return configureDataTexture(canvas, repeatX, repeatY, maxAnisotropy);
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextures {
  // 1. Lush PBR Farm Grass Albedo (512x512) + Normal + Roughness
  const [grassC, grassCtx] = makeCanvas(512, 512);
  grassCtx.fillStyle = '#47763f';
  grassCtx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 4) {
    for (let x = 0; x < 512; x += 4) {
      const n = tileableFbm(x / 512, y / 512, 6, 3, 11);
      const dampPatch = tileableFbm(x / 512, y / 512, 3, 2, 211);
      const g = Math.round(88 + n * 54 - (dampPatch < 0.36 ? 12 : 0));
      const r = Math.round(52 + n * 38 + (dampPatch > 0.7 ? 10 : 0));
      const b = Math.round(40 + n * 24);
      grassCtx.fillStyle = `rgb(${r},${g},${b})`;
      grassCtx.fillRect(x, y, 4, 4);
    }
  }
  for (let i = 0; i < 6800; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const shade = Math.random();
    grassCtx.fillStyle =
      shade < 0.35
        ? 'rgba(32, 66, 28, 0.38)'
        : shade < 0.72
        ? 'rgba(105, 156, 78, 0.32)'
        : 'rgba(154, 198, 102, 0.22)';
    grassCtx.fillRect(x, y, 2 + Math.random() * 3, 4 + Math.random() * 6);
  }
  const grass = configureColorTexture(grassC, 22, 22, maxAnisotropy);

  const grassNormal = buildNormalTextureFromHeight(
    256,
    (u, v) => tileableFbm(u, v, 14, 3, 19),
    2.8,
    22,
    22,
    maxAnisotropy
  );

  const grassRoughness = buildRoughnessTexture(
    256,
    (u, v) => 0.72 + tileableFbm(u, v, 10, 3, 27) * 0.24,
    22,
    22,
    maxAnisotropy
  );

  // 2. Weathered Wood Planks PBR Albedo + Normal + Roughness
  const [woodC, woodCtx] = makeCanvas(512, 512);
  woodCtx.fillStyle = '#8b5a33';
  woodCtx.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 8; row++) {
    const y = row * 64;
    woodCtx.fillStyle = row % 2 === 0 ? '#794d2a' : '#946139';
    woodCtx.fillRect(0, y + 2, 512, 60);
    woodCtx.fillStyle = 'rgba(32, 16, 6, 0.5)';
    woodCtx.fillRect(0, y, 512, 3);
    // Plank grain & nail heads
    for (let g = 0; g < 42; g++) {
      woodCtx.fillStyle = g % 3 === 0 ? 'rgba(196, 148, 96, 0.14)' : 'rgba(46, 22, 8, 0.2)';
      woodCtx.fillRect(Math.random() * 512, y + 5 + Math.random() * 52, 36 + Math.random() * 94, 2);
    }
    woodCtx.fillStyle = 'rgba(28, 22, 18, 0.55)';
    for (let nx = 28; nx < 512; nx += 128) {
      woodCtx.beginPath();
      woodCtx.arc(nx, y + 14, 2.5, 0, Math.PI * 2);
      woodCtx.arc(nx, y + 50, 2.5, 0, Math.PI * 2);
      woodCtx.fill();
    }
  }
  const wood = configureColorTexture(woodC, 1, 1, maxAnisotropy);

  const woodNormal = buildNormalTextureFromHeight(
    256,
    (u, v) => {
      const plankEdge = Math.abs(((v * 8) % 1) - 0.5) > 0.46 ? -0.48 : 0;
      return plankEdge + tileableFbm(u * 0.5, v * 4, 8, 3, 33) * 0.58;
    },
    3.4,
    1,
    1,
    maxAnisotropy
  );

  const woodRoughness = buildRoughnessTexture(
    256,
    (u, v) => 0.62 + tileableFbm(u * 0.5, v * 4, 8, 2, 37) * 0.28,
    1,
    1,
    maxAnisotropy
  );

  // 3. Stone Footpath PBR Albedo + Normal + Roughness
  const [stoneC, stoneCtx] = makeCanvas(512, 512);
  stoneCtx.fillStyle = '#6d6556';
  stoneCtx.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 6; col++) {
      const x = col * 85 + (row % 2) * 32 - 12;
      const y = row * 64 + 4;
      const w = 74;
      const h = 54;
      const shade = 118 + Math.round((hash2(col, row, 16, 41) - 0.5) * 42);
      stoneCtx.fillStyle = `rgb(${shade + 8}, ${shade}, ${shade - 14})`;
      stoneCtx.beginPath();
      stoneCtx.roundRect(x, y, w, h, 10);
      stoneCtx.fill();
      stoneCtx.strokeStyle = 'rgba(38,34,26,0.48)';
      stoneCtx.lineWidth = 3;
      stoneCtx.stroke();
    }
  }
  const stonePath = configureColorTexture(stoneC, 1, 6, maxAnisotropy);

  const stoneNormal = buildNormalTextureFromHeight(
    256,
    (u, v) => {
      const cx = ((u * 6 + Math.floor(v * 8) * 0.4) % 1) - 0.5;
      const cy = ((v * 8) % 1) - 0.5;
      const edge = Math.max(Math.abs(cx), Math.abs(cy)) > 0.42 ? -0.52 : 0.2;
      return edge + tileableFbm(u, v, 10, 3, 55) * 0.42;
    },
    3.6,
    1,
    6,
    maxAnisotropy
  );

  const stoneRoughness = buildRoughnessTexture(
    256,
    (u, v) => {
      const cx = ((u * 6 + Math.floor(v * 8) * 0.4) % 1) - 0.5;
      const cy = ((v * 8) % 1) - 0.5;
      const isMortar = Math.max(Math.abs(cx), Math.abs(cy)) > 0.42;
      return isMortar ? 0.94 : 0.56 + tileableFbm(u, v, 8, 2, 61) * 0.24;
    },
    1,
    6,
    maxAnisotropy
  );

  // 4. Distinct Pond Water Surfaces (Konvensional, Bioflok, RAS) + Seamless Wave Normal Map
  const [konvWC, konvWCtx] = makeCanvas(512, 512);
  konvWCtx.fillStyle = '#26849e';
  konvWCtx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 8) {
    for (let x = 0; x < 512; x += 8) {
      const n = tileableFbm(x / 512, y / 512, 5, 3, 83);
      const r = Math.round(28 + n * 28);
      const g = Math.round(118 + n * 48);
      const b = Math.round(132 + n * 42);
      konvWCtx.fillStyle = `rgb(${r},${g},${b})`;
      konvWCtx.fillRect(x, y, 8, 8);
    }
  }
  for (let i = 0; i < 95; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const rad = 16 + Math.random() * 44;
    const grad = konvWCtx.createRadialGradient(x, y, 2, x, y, rad);
    grad.addColorStop(0, 'rgba(204, 248, 240, 0.26)');
    grad.addColorStop(0.65, 'rgba(94, 204, 198, 0.11)');
    grad.addColorStop(1, 'rgba(38, 132, 158, 0)');
    konvWCtx.fillStyle = grad;
    konvWCtx.beginPath();
    konvWCtx.arc(x, y, rad, 0, Math.PI * 2);
    konvWCtx.fill();
  }
  const waterKonvensional = configureColorTexture(konvWC, 3, 3, maxAnisotropy);
  const waterCaustics = waterKonvensional;

  // 4B. Bioflok Water: Turbid amber-brown organic floc suspensions + aeration froth foam rings
  const [bioWC, bioWCtx] = makeCanvas(512, 512);
  bioWCtx.fillStyle = '#7b5e36';
  bioWCtx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 6) {
    for (let x = 0; x < 512; x += 6) {
      const n = tileableFbm(x / 512, y / 512, 6, 3, 211);
      const r = Math.round(108 + n * 48);
      const g = Math.round(86 + n * 40);
      const b = Math.round(48 + n * 28);
      bioWCtx.fillStyle = `rgb(${r},${g},${b})`;
      bioWCtx.fillRect(x, y, 6, 6);
    }
  }
  // Organic microbial floc clusters
  for (let i = 0; i < 650; i++) {
    const fx = Math.random() * 512;
    const fy = Math.random() * 512;
    const r = 1.5 + Math.random() * 4.2;
    bioWCtx.fillStyle = i % 3 === 0 ? 'rgba(214, 180, 122, 0.26)' : 'rgba(92, 68, 34, 0.24)';
    bioWCtx.beginPath();
    bioWCtx.arc(fx, fy, r, 0, Math.PI * 2);
    bioWCtx.fill();
  }
  // White aeration micro-foam wisps & bubbles
  for (let i = 0; i < 75; i++) {
    const fx = Math.random() * 512;
    const fy = Math.random() * 512;
    const rad = 10 + Math.random() * 26;
    const fGrad = bioWCtx.createRadialGradient(fx, fy, 1, fx, fy, rad);
    fGrad.addColorStop(0, 'rgba(254, 249, 238, 0.42)');
    fGrad.addColorStop(0.45, 'rgba(245, 232, 206, 0.18)');
    fGrad.addColorStop(1, 'rgba(123, 94, 54, 0)');
    bioWCtx.fillStyle = fGrad;
    bioWCtx.beginPath();
    bioWCtx.arc(fx, fy, rad, 0, Math.PI * 2);
    bioWCtx.fill();
  }
  const waterBioflok = configureColorTexture(bioWC, 2.5, 2.5, maxAnisotropy);

  // 4C. RAS Water: Crystal-clear azure water with crisp bright caustics & sky reflection shimmer
  const [rasWC, rasWCtx] = makeCanvas(512, 512);
  rasWCtx.fillStyle = '#0ea5e9';
  rasWCtx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 8) {
    for (let x = 0; x < 512; x += 8) {
      const n = tileableFbm(x / 512, y / 512, 5, 3, 241);
      const r = Math.round(16 + n * 34);
      const g = Math.round(156 + n * 52);
      const b = Math.round(218 + n * 32);
      rasWCtx.fillStyle = `rgb(${r},${g},${b})`;
      rasWCtx.fillRect(x, y, 8, 8);
    }
  }
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const rad = 14 + Math.random() * 38;
    const grad = rasWCtx.createRadialGradient(x, y, 1, x, y, rad);
    grad.addColorStop(0, 'rgba(232, 252, 255, 0.45)');
    grad.addColorStop(0.55, 'rgba(125, 226, 255, 0.18)');
    grad.addColorStop(1, 'rgba(14, 165, 233, 0)');
    rasWCtx.fillStyle = grad;
    rasWCtx.beginPath();
    rasWCtx.arc(x, y, rad, 0, Math.PI * 2);
    rasWCtx.fill();
  }
  const waterRas = configureColorTexture(rasWC, 3, 3, maxAnisotropy);

  const waterNormals = buildNormalTextureFromHeight(
    256,
    (u, v) => {
      const w1 = Math.sin((u * 6 + v * 4) * Math.PI * 2) * 0.25;
      const w2 = Math.cos((u * 8 - v * 6) * Math.PI * 2) * 0.2;
      const fbm = tileableFbm(u, v, 8, 4, 91);
      return w1 + w2 + fbm * 0.72;
    },
    3.8,
    4,
    4,
    maxAnisotropy
  );

  // 5. Solar panel grid
  const [solarC, solarCtx] = makeCanvas(256, 256);
  solarCtx.fillStyle = '#0d2244';
  solarCtx.fillRect(0, 0, 256, 256);
  solarCtx.strokeStyle = '#60a5fa';
  solarCtx.lineWidth = 2;
  for (let x = 0; x <= 256; x += 32) {
    solarCtx.beginPath();
    solarCtx.moveTo(x, 0);
    solarCtx.lineTo(x, 256);
    solarCtx.stroke();
  }
  for (let y = 0; y <= 256; y += 32) {
    solarCtx.beginPath();
    solarCtx.moveTo(0, y);
    solarCtx.lineTo(256, y);
    solarCtx.stroke();
  }
  const solarGrid = configureColorTexture(solarC, 1, 1, maxAnisotropy);

  // 6. Soft radial contact shadow
  const [shadC, shadCtx] = makeCanvas(128, 128);
  const sGrad = shadCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
  sGrad.addColorStop(0, 'rgba(0, 0, 0, 0.58)');
  sGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.24)');
  sGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shadCtx.fillStyle = sGrad;
  shadCtx.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.CanvasTexture(shadC);

  // 7. Corrugated sheet metal + brushed metal normal/roughness + PVC pipe normal/roughness
  const [metalC, metalCtx] = makeCanvas(128, 128);
  for (let x = 0; x < 128; x += 8) {
    metalCtx.fillStyle = (x / 8) % 2 === 0 ? '#94a3b8' : '#64748b';
    metalCtx.fillRect(x, 0, 8, 128);
  }
  const metalCorrugated = configureColorTexture(metalC, 3, 1, maxAnisotropy);

  const metalNormal = buildNormalTextureFromHeight(
    256,
    (u, v) => {
      const brush = tileableFbm(u * 6, v * 0.25, 16, 2, 261) * 0.35;
      const seam = Math.abs(((v * 4) % 1) - 0.5) > 0.47 ? -0.35 : 0;
      return brush + seam;
    },
    2.2,
    2,
    2,
    maxAnisotropy
  );

  const metalRoughness = buildRoughnessTexture(
    256,
    (u, v) => 0.18 + tileableFbm(u * 5, v * 0.3, 12, 2, 267) * 0.18,
    2,
    2,
    maxAnisotropy
  );

  const pvcNormal = buildNormalTextureFromHeight(
    128,
    (u, v) => Math.sin(u * Math.PI * 24) * 0.06 + (Math.abs(((v * 4) % 1) - 0.5) < 0.04 ? 0.35 : 0),
    1.6,
    1,
    2,
    maxAnisotropy
  );

  const pvcRoughness = buildRoughnessTexture(
    128,
    (u, v) => 0.22 + tileableFbm(u, v, 8, 2, 271) * 0.1,
    1,
    2,
    maxAnisotropy
  );

  // 8. Woven HDPE Tarpaulin (512x512)
  const [tarpC, tarpCtx] = makeCanvas(512, 512);
  tarpCtx.fillStyle = '#144c73';
  tarpCtx.fillRect(0, 0, 512, 512);
  tarpCtx.strokeStyle = 'rgba(255,255,255,0.07)';
  tarpCtx.lineWidth = 1;
  for (let i = 0; i < 512; i += 8) {
    tarpCtx.beginPath();
    tarpCtx.moveTo(i, 0);
    tarpCtx.lineTo(i, 512);
    tarpCtx.stroke();
    tarpCtx.beginPath();
    tarpCtx.moveTo(0, i);
    tarpCtx.lineTo(512, i);
    tarpCtx.stroke();
  }
  tarpCtx.strokeStyle = 'rgba(8, 25, 42, 0.44)';
  tarpCtx.lineWidth = 5;
  tarpCtx.strokeRect(12, 12, 488, 488);
  const terpalHdpe = configureColorTexture(tarpC, 2, 2, maxAnisotropy);

  const terpalNormal = buildNormalTextureFromHeight(
    256,
    (u, v) => {
      const weave = Math.sin(u * Math.PI * 32) * Math.sin(v * Math.PI * 32) * 0.35;
      const crease = tileableFbm(u, v, 5, 2, 131) * 0.65;
      return weave + crease;
    },
    2.5,
    2,
    2,
    maxAnisotropy
  );

  const terpalRoughness = buildRoughnessTexture(
    256,
    (u, v) => 0.34 + tileableFbm(u, v, 8, 2, 137) * 0.24,
    2,
    2,
    maxAnisotropy
  );

  // 9. Concrete PBR Albedo + Normal + Roughness
  const [concC, concCtx] = makeCanvas(512, 512);
  concCtx.fillStyle = '#cbd5e1';
  concCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4800; i++) {
    concCtx.fillStyle = Math.random() > 0.5 ? 'rgba(100,116,139,0.18)' : 'rgba(248,250,252,0.22)';
    concCtx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
  }
  concCtx.strokeStyle = 'rgba(71, 85, 105, 0.32)';
  concCtx.lineWidth = 3;
  concCtx.strokeRect(0, 0, 512, 256);
  const concrete = configureColorTexture(concC, 1, 1, maxAnisotropy);

  const concreteNormal = buildNormalTextureFromHeight(
    256,
    (u, v) => tileableFbm(u, v, 12, 3, 73),
    2.3,
    1,
    1,
    maxAnisotropy
  );

  const concreteRoughness = buildRoughnessTexture(
    256,
    (u, v) => 0.66 + tileableFbm(u, v, 12, 3, 79) * 0.26,
    1,
    1,
    maxAnisotropy
  );

  // 10. Terracotta roof PBR Albedo + Normal + Roughness
  const [roofC, roofCtx] = makeCanvas(512, 512);
  roofCtx.fillStyle = '#9a3412';
  roofCtx.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 16; row++) {
    const y = row * 32;
    roofCtx.fillStyle = row % 2 === 0 ? '#b45309' : '#9a3412';
    roofCtx.fillRect(0, y, 512, 28);
    roofCtx.fillStyle = 'rgba(40, 12, 4, 0.42)';
    roofCtx.fillRect(0, y + 28, 512, 4);
    for (let x = 0; x < 512; x += 48) {
      roofCtx.fillRect(x + (row % 2) * 24, y, 4, 32);
    }
  }
  const terracottaRoof = configureColorTexture(roofC, 2, 2, maxAnisotropy);

  const roofNormal = buildNormalTextureFromHeight(
    256,
    (u, v) => Math.sin(u * Math.PI * 16) * 0.35 + Math.sin(v * Math.PI * 32) * 0.25,
    3.5,
    2,
    2,
    maxAnisotropy
  );

  const roofRoughness = buildRoughnessTexture(
    256,
    (u, v) => 0.56 + tileableFbm(u, v, 10, 2, 283) * 0.24,
    2,
    2,
    maxAnisotropy
  );

  // 11. Galvanized wire-mesh grid for Bioflok tanks
  const [wireC, wireCtx] = makeCanvas(256, 256);
  wireCtx.fillStyle = '#1e3a4c';
  wireCtx.fillRect(0, 0, 256, 256);
  wireCtx.strokeStyle = '#cbd5e1';
  wireCtx.lineWidth = 3;
  for (let x = 0; x <= 256; x += 32) {
    wireCtx.beginPath();
    wireCtx.moveTo(x, 0);
    wireCtx.lineTo(x, 256);
    wireCtx.stroke();
  }
  for (let y = 0; y <= 256; y += 32) {
    wireCtx.beginPath();
    wireCtx.moveTo(0, y);
    wireCtx.lineTo(256, y);
    wireCtx.stroke();
  }
  const galvanizedMesh = configureColorTexture(wireC, 4, 2, maxAnisotropy);

  const galvanizedNormal = buildNormalTextureFromHeight(
    256,
    (u, v) => {
      const gx = Math.abs(((u * 8) % 1) - 0.5) > 0.42 ? 0.55 : 0;
      const gy = Math.abs(((v * 8) % 1) - 0.5) > 0.42 ? 0.55 : 0;
      return Math.max(gx, gy);
    },
    3.6,
    4,
    2,
    maxAnisotropy
  );

  const galvanizedRoughness = buildRoughnessTexture(
    256,
    (u, v) => {
      const isWire = Math.abs(((u * 8) % 1) - 0.5) > 0.42 || Math.abs(((v * 8) % 1) - 0.5) > 0.42;
      return isWire ? 0.24 : 0.44 + tileableFbm(u, v, 8, 2, 149) * 0.14;
    },
    4,
    2,
    maxAnisotropy
  );

  // 11B. Embankment wet packed earth PBR (Konvensional berm)
  const [earthC, earthCtx] = makeCanvas(256, 256);
  earthCtx.fillStyle = '#6b563c';
  earthCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 4) {
    for (let x = 0; x < 256; x += 4) {
      const n = tileableFbm(x / 256, y / 256, 8, 3, 163);
      const damp = tileableFbm(x / 256, y / 256, 4, 2, 197);
      const darkScale = damp < 0.42 ? 0.78 : 1.0;
      const r = Math.round((84 + n * 44) * darkScale);
      const g = Math.round((66 + n * 34) * darkScale);
      const b = Math.round((45 + n * 24) * darkScale);
      earthCtx.fillStyle = `rgb(${r},${g},${b})`;
      earthCtx.fillRect(x, y, 4, 4);
    }
  }
  const earth = configureColorTexture(earthC, 2, 1, maxAnisotropy);

  const earthNormal = buildNormalTextureFromHeight(
    256,
    (u, v) => tileableFbm(u, v, 14, 3, 173),
    3.1,
    2,
    1,
    maxAnisotropy
  );

  const earthRoughness = buildRoughnessTexture(
    256,
    (u, v) => {
      const damp = tileableFbm(u, v, 4, 2, 197);
      const base = damp < 0.42 ? 0.46 : 0.78;
      return base + tileableFbm(u, v, 10, 2, 181) * 0.18;
    },
    2,
    1,
    maxAnisotropy
  );

  // 11C. Bamboo PBR Albedo + Normal (Konvensional stakes & canopy posts)
  const [bamC, bamCtx] = makeCanvas(256, 256);
  bamCtx.fillStyle = '#b08d57';
  bamCtx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 6) {
    bamCtx.fillStyle = x % 12 === 0 ? 'rgba(214, 182, 120, 0.28)' : 'rgba(110, 82, 42, 0.22)';
    bamCtx.fillRect(x, 0, 4, 256);
  }
  for (let y = 32; y < 256; y += 64) {
    bamCtx.fillStyle = 'rgba(72, 52, 24, 0.55)';
    bamCtx.fillRect(0, y, 256, 5);
  }
  const bamboo = configureColorTexture(bamC, 1, 1, maxAnisotropy);

  const bambooNormal = buildNormalTextureFromHeight(
    256,
    (u, v) => {
      const node = Math.abs(((v * 4) % 1) - 0.5) < 0.04 ? 0.45 : 0;
      return node + Math.sin(u * Math.PI * 24) * 0.12;
    },
    2.6,
    1,
    1,
    maxAnisotropy
  );

  // 12. Tree bark PBR Albedo + Normal + Roughness
  const [barkC, barkCtx] = makeCanvas(256, 256);
  barkCtx.fillStyle = '#5c3c24';
  barkCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 420; i++) {
    barkCtx.fillStyle = i % 2 === 0 ? 'rgba(38, 22, 10, 0.35)' : 'rgba(120, 82, 52, 0.25)';
    barkCtx.fillRect(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 4, 24 + Math.random() * 40);
  }
  const bark = configureColorTexture(barkC, 1, 1, maxAnisotropy);

  const barkNormal = buildNormalTextureFromHeight(
    256,
    (u, v) => tileableFbm(u * 3, v * 0.5, 10, 3, 103),
    3.4,
    1,
    1,
    maxAnisotropy
  );

  const barkRoughness = buildRoughnessTexture(
    256,
    (u, v) => 0.78 + tileableFbm(u * 2, v * 0.5, 10, 2, 109) * 0.18,
    1,
    1,
    maxAnisotropy
  );

  return {
    grass,
    grassNormal,
    grassRoughness,
    wood,
    woodNormal,
    woodRoughness,
    stonePath,
    stoneNormal,
    stoneRoughness,
    waterCaustics,
    waterKonvensional,
    waterBioflok,
    waterRas,
    waterNormals,
    solarGrid,
    contactShadow,
    metalCorrugated,
    metalNormal,
    metalRoughness,
    pvcNormal,
    pvcRoughness,
    terpalHdpe,
    terpalNormal,
    terpalRoughness,
    concrete,
    concreteNormal,
    concreteRoughness,
    terracottaRoof,
    roofNormal,
    roofRoughness,
    galvanizedMesh,
    galvanizedNormal,
    galvanizedRoughness,
    earth,
    earthNormal,
    earthRoughness,
    bamboo,
    bambooNormal,
    bark,
    barkNormal,
    barkRoughness,
    disposeAll: () => {
      grass.dispose();
      grassNormal.dispose();
      grassRoughness.dispose();
      wood.dispose();
      woodNormal.dispose();
      woodRoughness.dispose();
      stonePath.dispose();
      stoneNormal.dispose();
      stoneRoughness.dispose();
      waterKonvensional.dispose();
      waterBioflok.dispose();
      waterRas.dispose();
      waterNormals.dispose();
      solarGrid.dispose();
      contactShadow.dispose();
      metalCorrugated.dispose();
      metalNormal.dispose();
      metalRoughness.dispose();
      pvcNormal.dispose();
      pvcRoughness.dispose();
      terpalHdpe.dispose();
      terpalNormal.dispose();
      terpalRoughness.dispose();
      concrete.dispose();
      concreteNormal.dispose();
      concreteRoughness.dispose();
      terracottaRoof.dispose();
      roofNormal.dispose();
      roofRoughness.dispose();
      galvanizedMesh.dispose();
      galvanizedNormal.dispose();
      galvanizedRoughness.dispose();
      earth.dispose();
      earthNormal.dispose();
      earthRoughness.dispose();
      bamboo.dispose();
      bambooNormal.dispose();
      bark.dispose();
      barkNormal.dispose();
      barkRoughness.dispose();
    },
  };
}
