import * as THREE from 'three';

export interface ProceduralTextureSet {
  asphaltMap: THREE.CanvasTexture;
  asphaltBump: THREE.CanvasTexture;
  kerbMap: THREE.CanvasTexture;
  grassMap: THREE.CanvasTexture;
  barrierMap: THREE.CanvasTexture;
  startLineMap: THREE.CanvasTexture;
  gantryBannerMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const allTextures: THREE.Texture[] = [];

  const register = (
    tex: THREE.CanvasTexture,
    isColor: boolean,
    repeatX = 1,
    repeatY = 1
  ): THREE.CanvasTexture => {
    tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = maxAnisotropy;
    tex.needsUpdate = true;
    allTextures.push(tex);
    return tex;
  };

  // 1. Asphalt Road Surface (U = across width [0..1], V = along length)
  const [asphCanvas, asphCtx] = makeCanvas(512, 512);
  asphCtx.fillStyle = '#2b2e33';
  asphCtx.fillRect(0, 0, 512, 512);

  // Subtle dark racing groove in center lanes + fine aggregate speckle
  const groove = asphCtx.createLinearGradient(0, 0, 512, 0);
  groove.addColorStop(0.0, 'rgba(18, 20, 24, 0.25)');
  groove.addColorStop(0.18, 'rgba(14, 15, 18, 0.42)');
  groove.addColorStop(0.5, 'rgba(30, 33, 38, 0.05)');
  groove.addColorStop(0.82, 'rgba(14, 15, 18, 0.42)');
  groove.addColorStop(1.0, 'rgba(18, 20, 24, 0.25)');
  asphCtx.fillStyle = groove;
  asphCtx.fillRect(0, 0, 512, 512);

  // Deterministic pseudo-random aggregate speckle
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 9000; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const v = 30 + Math.floor(rand() * 38);
    asphCtx.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
    asphCtx.fillRect(x, y, 2, 2);
  }

  // Crisp white track edge lines
  asphCtx.fillStyle = '#e9edf2';
  asphCtx.fillRect(14, 0, 12, 512);
  asphCtx.fillRect(486, 0, 12, 512);

  // Subtle dashed centerline
  asphCtx.fillStyle = 'rgba(232, 236, 240, 0.52)';
  for (let y = 24; y < 512; y += 128) {
    asphCtx.fillRect(252, y, 8, 64);
  }
  const asphaltMap = register(new THREE.CanvasTexture(asphCanvas), true);

  // 2. Asphalt Bump Map (grayscale linear)
  const [bumpCanvas, bumpCtx] = makeCanvas(256, 256);
  bumpCtx.fillStyle = '#808080';
  bumpCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6000; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const g = 95 + Math.floor(rand() * 65);
    bumpCtx.fillStyle = `rgb(${g},${g},${g})`;
    bumpCtx.fillRect(x, y, 2, 2);
  }
  const asphaltBump = register(new THREE.CanvasTexture(bumpCanvas), false);

  // 3. FIA Red & White Rumble Kerbs
  const [kerbCanvas, kerbCtx] = makeCanvas(128, 256);
  kerbCtx.fillStyle = '#d92b2b';
  kerbCtx.fillRect(0, 0, 128, 128);
  kerbCtx.fillStyle = '#f4f1ea';
  kerbCtx.fillRect(0, 128, 128, 128);
  // Subtle concrete edge border
  kerbCtx.fillStyle = 'rgba(20, 22, 26, 0.25)';
  kerbCtx.fillRect(0, 0, 8, 256);
  kerbCtx.fillRect(120, 0, 8, 256);
  const kerbMap = register(new THREE.CanvasTexture(kerbCanvas), true);

  // 4. Sunlit Meadow Grass Texture
  const [grassCanvas, grassCtx] = makeCanvas(512, 512);
  grassCtx.fillStyle = '#5f8746';
  grassCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 7500; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 74 + Math.floor(rand() * 34);
    const g = 114 + Math.floor(rand() * 36);
    const b = 52 + Math.floor(rand() * 26);
    grassCtx.fillStyle = `rgb(${r},${g},${b})`;
    grassCtx.fillRect(x, y, 3, 5);
  }
  const grassMap = register(new THREE.CanvasTexture(grassCanvas), true, 48, 48);

  // 5. Safety Barrier Texture (concrete wall + red/white motorsport top stripe)
  const [barCanvas, barCtx] = makeCanvas(256, 128);
  barCtx.fillStyle = '#d2d6dc';
  barCtx.fillRect(0, 0, 256, 128);
  // Top crimson/white racing stripe band
  barCtx.fillStyle = '#cf2a2a';
  barCtx.fillRect(0, 0, 128, 30);
  barCtx.fillStyle = '#f8f9fa';
  barCtx.fillRect(128, 0, 128, 30);
  // Lower concrete panel seams & scuff
  barCtx.fillStyle = '#9aa1ab';
  barCtx.fillRect(0, 114, 256, 14);
  barCtx.fillStyle = 'rgba(70, 75, 84, 0.24)';
  barCtx.fillRect(126, 30, 4, 84);
  const barrierMap = register(new THREE.CanvasTexture(barCanvas), true);

  // 6. Start/Finish Checkered Line
  const [sfCanvas, sfCtx] = makeCanvas(512, 128);
  const cols = 16;
  const rows = 4;
  const cw = 512 / cols;
  const ch = 128 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      sfCtx.fillStyle = (r + c) % 2 === 0 ? '#f6f7f9' : '#181a1f';
      sfCtx.fillRect(c * cw, r * ch, cw, ch);
    }
  }
  const startLineMap = register(new THREE.CanvasTexture(sfCanvas), true);
  startLineMap.wrapS = THREE.ClampToEdgeWrapping;
  startLineMap.wrapT = THREE.ClampToEdgeWrapping;

  // 7. Gantry Overhead Banner
  const [banCanvas, banCtx] = makeCanvas(1024, 192);
  banCtx.fillStyle = '#151922';
  banCtx.fillRect(0, 0, 1024, 192);
  banCtx.fillStyle = '#e03131';
  banCtx.fillRect(0, 0, 1024, 18);
  banCtx.fillRect(0, 174, 1024, 18);
  // Checker accents on sides
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      banCtx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#151922';
      banCtx.fillRect(28 + c * 28, 36 + r * 30, 28, 30);
      banCtx.fillRect(884 + c * 28, 36 + r * 30, 28, 30);
    }
  }
  banCtx.fillStyle = '#ffffff';
  banCtx.font = '900 74px system-ui, -apple-system, sans-serif';
  banCtx.textAlign = 'center';
  banCtx.textBaseline = 'middle';
  banCtx.fillText('APEX CIRCUIT', 512, 98);
  const gantryBannerMap = register(new THREE.CanvasTexture(banCanvas), true);
  gantryBannerMap.wrapS = THREE.ClampToEdgeWrapping;
  gantryBannerMap.wrapT = THREE.ClampToEdgeWrapping;

  // 8. Soft Radial Contact Shadow Disc
  const [shCanvas, shCtx] = makeCanvas(256, 256);
  const radGrad = shCtx.createRadialGradient(128, 128, 16, 128, 128, 126);
  radGrad.addColorStop(0.0, 'rgba(8, 12, 18, 0.72)');
  radGrad.addColorStop(0.55, 'rgba(8, 12, 18, 0.42)');
  radGrad.addColorStop(1.0, 'rgba(8, 12, 18, 0.0)');
  shCtx.fillStyle = radGrad;
  shCtx.fillRect(0, 0, 256, 256);
  const contactShadowMap = register(new THREE.CanvasTexture(shCanvas), true);
  contactShadowMap.wrapS = THREE.ClampToEdgeWrapping;
  contactShadowMap.wrapT = THREE.ClampToEdgeWrapping;

  return {
    asphaltMap,
    asphaltBump,
    kerbMap,
    grassMap,
    barrierMap,
    startLineMap,
    gantryBannerMap,
    contactShadowMap,
    dispose: () => {
      for (const tex of allTextures) tex.dispose();
    },
  };
}
