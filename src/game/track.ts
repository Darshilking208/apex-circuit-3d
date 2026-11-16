export interface Vec2 {
  x: number;
  z: number;
}

export interface TrackSample {
  index: number;
  x: number;
  z: number;
  tx: number; // unit forward tangent X
  tz: number; // unit forward tangent Z
  nx: number; // unit right normal X (perpendicular to tangent)
  nz: number; // unit right normal Z
  s: number;  // cumulative arc length from start/finish
}

export interface ClosestTrackInfo {
  sampleIndex: number;
  s: number;
  lateralOffset: number; // signed distance along right normal (+ = right of centerline)
  x: number;             // closest point on centerline
  z: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  distSq: number;
}

export const TRACK_HALF_WIDTH = 7.5;
export const KERB_WIDTH = 1.1;
export const WALL_HALF_WIDTH = 9.2;

/**
 * Closed-loop circuit control points in world XZ coordinates (meters).
 * Start/Finish is at (0, 0) heading along -Z (tx = 0, tz = -1).
 */
export const TRACK_CONTROL_POINTS: readonly Vec2[] = [
  { x: 0, z: 16 },
  { x: 0, z: -48 },
  { x: -24, z: -84 },
  { x: -72, z: -86 },
  { x: -102, z: -50 },
  { x: -78, z: -8 },
  { x: -102, z: 36 },
  { x: -78, z: 78 },
  { x: -40, z: 88 },
  { x: -10, z: 72 },
  { x: 0, z: 44 },
];

function catmullRomCentripetal(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  t: number
): Vec2 {
  const t2 = t * t;
  const t3 = t2 * t;
  // Standard uniform Catmull-Rom spline (alpha = 0.5 tension)
  const x =
    0.5 *
    (2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  const z =
    0.5 *
    (2 * p1.z +
      (-p0.z + p2.z) * t +
      (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
      (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
  return { x, z };
}

function buildTrackSamples(sampleCount = 480): {
  samples: TrackSample[];
  totalLength: number;
} {
  const pts = TRACK_CONTROL_POINTS;
  const n = pts.length;

  // Dense initial sampling for arc-length parameterization
  const denseCount = 2400;
  const densePts: Vec2[] = [];
  const cumLen: number[] = [0];

  for (let i = 0; i < denseCount; i++) {
    const u = (i / denseCount) * n;
    const seg = Math.floor(u) % n;
    const localT = u - Math.floor(u);
    const p0 = pts[(seg - 1 + n) % n];
    const p1 = pts[seg];
    const p2 = pts[(seg + 1) % n];
    const p3 = pts[(seg + 2) % n];
    const pt = catmullRomCentripetal(p0, p1, p2, p3, localT);
    densePts.push(pt);
    if (i > 0) {
      const dx = pt.x - densePts[i - 1].x;
      const dz = pt.z - densePts[i - 1].z;
      cumLen.push(cumLen[i - 1] + Math.hypot(dx, dz));
    }
  }
  const closingDist = Math.hypot(
    densePts[0].x - densePts[denseCount - 1].x,
    densePts[0].z - densePts[denseCount - 1].z
  );
  const totalLength = cumLen[denseCount - 1] + closingDist;

  // Resample evenly by arc length, shifting s=0 to be near (0, 0) on the start straight
  const evenPts: Vec2[] = [];
  let denseIdx = 0;
  for (let i = 0; i < sampleCount; i++) {
    const targetS = (i / sampleCount) * totalLength;
    while (denseIdx < denseCount - 1 && cumLen[denseIdx + 1] < targetS) {
      denseIdx++;
    }
    const s0 = cumLen[denseIdx];
    const s1 =
      denseIdx < denseCount - 1 ? cumLen[denseIdx + 1] : totalLength;
    const nextPt =
      denseIdx < denseCount - 1 ? densePts[denseIdx + 1] : densePts[0];
    const alpha = s1 > s0 ? (targetS - s0) / (s1 - s0) : 0;
    evenPts.push({
      x: densePts[denseIdx].x + (nextPt.x - densePts[denseIdx].x) * alpha,
      z: densePts[denseIdx].z + (nextPt.z - densePts[denseIdx].z) * alpha,
    });
  }

  // Rotate array so index 0 is closest to (0, 0) on the main straight
  let startIdx = 0;
  let bestStartDist = Infinity;
  for (let i = 0; i < sampleCount; i++) {
    const d = evenPts[i].x * evenPts[i].x + evenPts[i].z * evenPts[i].z;
    if (d < bestStartDist) {
      bestStartDist = d;
      startIdx = i;
    }
  }

  const orderedPts: Vec2[] = [];
  for (let i = 0; i < sampleCount; i++) {
    orderedPts.push(evenPts[(startIdx + i) % sampleCount]);
  }

  const samples: TrackSample[] = [];
  let runningS = 0;
  for (let i = 0; i < sampleCount; i++) {
    const prev = orderedPts[(i - 1 + sampleCount) % sampleCount];
    const curr = orderedPts[i];
    const next = orderedPts[(i + 1) % sampleCount];
    if (i > 0) {
      runningS += Math.hypot(curr.x - prev.x, curr.z - prev.z);
    }
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const tx = dx / len;
    const tz = dz / len;
    // Right-hand normal in XZ plane (when facing -Z, right is +X):
    // cross(tangent, up(0,1,0)) = (tx, 0, tz) x (0, 1, 0) = (-tz, 0, tx)
    const nx = -tz;
    const nz = tx;
    samples.push({
      index: i,
      x: curr.x,
      z: curr.z,
      tx,
      tz,
      nx,
      nz,
      s: runningS,
    });
  }

  return { samples, totalLength };
}

const BUILT = buildTrackSamples(480);
export const TRACK_SAMPLES: readonly TrackSample[] = BUILT.samples;
export const TRACK_LENGTH: number = BUILT.totalLength;

export function getTrackSampleAtS(s: number): TrackSample {
  const wrapped = ((s % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH;
  const frac = wrapped / TRACK_LENGTH;
  const idx = Math.floor(frac * TRACK_SAMPLES.length) % TRACK_SAMPLES.length;
  return TRACK_SAMPLES[idx];
}

export function findClosestTrackSample(x: number, z: number): ClosestTrackInfo {
  let bestIdx = 0;
  let bestDistSq = Infinity;

  for (let i = 0; i < TRACK_SAMPLES.length; i++) {
    const smp = TRACK_SAMPLES[i];
    const dx = x - smp.x;
    const dz = z - smp.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestIdx = i;
    }
  }

  const prev =
    TRACK_SAMPLES[(bestIdx - 1 + TRACK_SAMPLES.length) % TRACK_SAMPLES.length];
  const curr = TRACK_SAMPLES[bestIdx];
  const next = TRACK_SAMPLES[(bestIdx + 1) % TRACK_SAMPLES.length];

  // Refine projection onto local segment [prev..next]
  const segX = next.x - prev.x;
  const segZ = next.z - prev.z;
  const segLenSq = segX * segX + segZ * segZ || 1;
  const relX = x - curr.x;
  const relZ = z - curr.z;
  const projAlong = relX * curr.tx + relZ * curr.tz;

  const projX = curr.x + curr.tx * projAlong;
  const projZ = curr.z + curr.tz * projAlong;
  const lateralOffset = (x - projX) * curr.nx + (z - projZ) * curr.nz;

  // Approximate refined arc length
  const stepLen = Math.sqrt(segLenSq) * 0.5;
  const clampedAlong = Math.max(-stepLen, Math.min(stepLen, projAlong));
  const refinedS =
    ((curr.s + clampedAlong) % TRACK_LENGTH + TRACK_LENGTH) % TRACK_LENGTH;

  return {
    sampleIndex: bestIdx,
    s: refinedS,
    lateralOffset,
    x: projX,
    z: projZ,
    tx: curr.tx,
    tz: curr.tz,
    nx: curr.nx,
    nz: curr.nz,
    distSq: bestDistSq,
  };
}

export interface BarrierClampResult {
  x: number;
  z: number;
  vx: number;
  vz: number;
  hitBarrier: boolean;
  impactSpeed: number;
  lateralOffset: number;
  trackInfo: ClosestTrackInfo;
}

export function clampToTrackBarriers(
  x: number,
  z: number,
  vx: number,
  vz: number,
  carRadius = 1.15
): BarrierClampResult {
  const info = findClosestTrackSample(x, z);
  const maxLat = WALL_HALF_WIDTH - carRadius;

  if (Math.abs(info.lateralOffset) <= maxLat) {
    return {
      x,
      z,
      vx,
      vz,
      hitBarrier: false,
      impactSpeed: 0,
      lateralOffset: info.lateralOffset,
      trackInfo: info,
    };
  }

  const sign = info.lateralOffset > 0 ? 1 : -1;
  const clampedLat = sign * maxLat;
  const newX = info.x + info.nx * clampedLat;
  const newZ = info.z + info.nz * clampedLat;

  // Decompose velocity into normal (outward) and tangential components
  const vNorm = vx * info.nx + vz * info.nz;
  let newVx = vx;
  let newVz = vz;
  let impactSpeed = 0;

  // Only reflect/damp if moving into the wall
  if (vNorm * sign > 0) {
    impactSpeed = Math.abs(vNorm);
    const vTan = vx * info.tx + vz * info.tz;
    const bounceNorm = -vNorm * 0.32;
    const scrapedTan = vTan * 0.88;
    newVx = info.tx * scrapedTan + info.nx * bounceNorm;
    newVz = info.tz * scrapedTan + info.nz * bounceNorm;
  }

  return {
    x: newX,
    z: newZ,
    vx: newVx,
    vz: newVz,
    hitBarrier: true,
    impactSpeed,
    lateralOffset: clampedLat,
    trackInfo: info,
  };
}

/**
 * Generates normalized [0..1] 2D coordinates for the HUD minimap.
 */
export function getMinimapTrackPoints(): {
  points: Vec2[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of TRACK_SAMPLES) {
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.z < minZ) minZ = s.z;
    if (s.z > maxZ) maxZ = s.z;
  }
  const pad = 12;
  minX -= pad;
  maxX += pad;
  minZ -= pad;
  maxZ += pad;
  const span = Math.max(maxX - minX, maxZ - minZ);
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;

  const points: Vec2[] = [];
  for (let i = 0; i < TRACK_SAMPLES.length; i += 4) {
    const s = TRACK_SAMPLES[i];
    points.push({
      x: (s.x - cx) / span + 0.5,
      z: (s.z - cz) / span + 0.5,
    });
  }
  return {
    points,
    bounds: {
      minX: cx - span * 0.5,
      maxX: cx + span * 0.5,
      minZ: cz - span * 0.5,
      maxZ: cz + span * 0.5,
    },
  };
}
