import * as THREE from 'three';
import {
  KERB_WIDTH,
  TRACK_HALF_WIDTH,
  TRACK_LENGTH,
  TRACK_SAMPLES,
  WALL_HALF_WIDTH,
  findClosestTrackSample,
  getTrackSampleAtS,
} from './track';
import { ProceduralTextureSet } from './textures';

export interface WorldHandles {
  startLights: THREE.MeshStandardMaterial[];
  sectorBeacons: THREE.MeshStandardMaterial[];
  emitParticle: (
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    size: number,
    life: number,
    colorHex: number
  ) => void;
  updateParticles: (dt: number) => void;
  updateEffects: (checkpointReached: number | null, dt: number) => void;
  dispose: () => void;
}

/**
 * Builds a ribbon strip BufferGeometry along the closed TRACK_SAMPLES loop.
 */
function buildClosedRibbonGeometry(
  innerOffset: number,
  outerOffset: number,
  yInner: number,
  yOuter: number,
  uTileLength: number
): THREE.BufferGeometry {
  const n = TRACK_SAMPLES.length;
  const vertCount = (n + 1) * 2;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const indices: number[] = [];

  for (let i = 0; i <= n; i++) {
    const s = TRACK_SAMPLES[i % n];
    const vCoord = (i === n ? TRACK_LENGTH : s.s) / uTileLength;

    const ix = s.x + s.nx * innerOffset;
    const iz = s.z + s.nz * innerOffset;
    const ox = s.x + s.nx * outerOffset;
    const oz = s.z + s.nz * outerOffset;

    const vi = i * 2;
    positions[vi * 3] = ix;
    positions[vi * 3 + 1] = yInner;
    positions[vi * 3 + 2] = iz;

    positions[(vi + 1) * 3] = ox;
    positions[(vi + 1) * 3 + 1] = yOuter;
    positions[(vi + 1) * 3 + 2] = oz;

    normals[vi * 3 + 1] = 1;
    normals[(vi + 1) * 3 + 1] = 1;

    uvs[vi * 2] = 0;
    uvs[vi * 2 + 1] = vCoord;
    uvs[(vi + 1) * 2] = 1;
    uvs[(vi + 1) * 2 + 1] = vCoord;

    if (i < n) {
      const a = vi;
      const b = vi + 1;
      const c = vi + 2;
      const d = vi + 3;
      // Counter-clockwise when viewed from +Y so face normals point upward (+Y)
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/**
 * Builds a continuous closed-loop extruded barrier wall with front/top/back faces.
 */
function buildBarrierWallGeometry(
  centerOffset: number,
  halfThick: number,
  height: number,
  tileLen = 8
): THREE.BufferGeometry {
  const n = TRACK_SAMPLES.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const pushQuad = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    u0: number, u1: number
  ) => {
    const base = positions.length / 3;
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    uvs.push(u0, 0, u1, 0, u1, 1, u0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  const innerOff = centerOffset - halfThick;
  const outerOff = centerOffset + halfThick;

  for (let i = 0; i < n; i++) {
    const s0 = TRACK_SAMPLES[i];
    const s1 = TRACK_SAMPLES[(i + 1) % n];
    const u0 = s0.s / tileLen;
    const u1 = (i === n - 1 ? TRACK_LENGTH : s1.s) / tileLen;

    const i0x = s0.x + s0.nx * innerOff;
    const i0z = s0.z + s0.nz * innerOff;
    const o0x = s0.x + s0.nx * outerOff;
    const o0z = s0.z + s0.nz * outerOff;

    const i1x = s1.x + s1.nx * innerOff;
    const i1z = s1.z + s1.nz * innerOff;
    const o1x = s1.x + s1.nx * outerOff;
    const o1z = s1.z + s1.nz * outerOff;

    // Inner face (facing -nx)
    pushQuad(i1x, 0, i1z, i0x, 0, i0z, i0x, height, i0z, i1x, height, i1z, u1, u0);
    // Outer face (facing +nx)
    pushQuad(o0x, 0, o0z, o1x, 0, o1z, o1x, height, o1z, o0x, height, o0z, u0, u1);
    // Top cap
    pushQuad(i0x, height, i0z, o0x, height, o0z, o1x, height, o1z, i1x, height, i1z, u0, u1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function buildRacingWorld(
  scene: THREE.Scene,
  textures: ProceduralTextureSet,
  castShadows: boolean
): WorldHandles {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // 1. Expansive Sunlit Meadow Ground Plane (y = 0)
  const groundMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.grassMap,
      roughness: 0.92,
      metalness: 0.0,
    })
  );
  const ground = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(900, 900)),
    groundMat
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);

  // 2. Track Asphalt Ribbon (y = 0.025 to eliminate Z-fighting with ground)
  const asphaltMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.asphaltMap,
      bumpMap: textures.asphaltBump,
      bumpScale: 0.035,
      roughness: 0.82,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const roadGeo = trackGeo(
    buildClosedRibbonGeometry(-TRACK_HALF_WIDTH, TRACK_HALF_WIDTH, 0.025, 0.025, 16)
  );
  const roadMesh = new THREE.Mesh(roadGeo, asphaltMat);
  roadMesh.receiveShadow = true;
  scene.add(roadMesh);

  // 3. FIA Red/White Apex Kerbs flanking both sides (y = 0.03 -> 0.075 slight ramp)
  const kerbMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.kerbMap,
      roughness: 0.72,
      metalness: 0.05,
    })
  );
  const leftKerbGeo = trackGeo(
    buildClosedRibbonGeometry(
      -TRACK_HALF_WIDTH - KERB_WIDTH,
      -TRACK_HALF_WIDTH,
      0.065,
      0.028,
      3.5
    )
  );
  const rightKerbGeo = trackGeo(
    buildClosedRibbonGeometry(
      TRACK_HALF_WIDTH,
      TRACK_HALF_WIDTH + KERB_WIDTH,
      0.028,
      0.065,
      3.5
    )
  );
  const leftKerb = new THREE.Mesh(leftKerbGeo, kerbMat);
  const rightKerb = new THREE.Mesh(rightKerbGeo, kerbMat);
  leftKerb.receiveShadow = true;
  rightKerb.receiveShadow = true;
  scene.add(leftKerb, rightKerb);

  // 4. Continuous Inner & Outer Safety Barrier Walls (at ±WALL_HALF_WIDTH = 9.2m)
  const barrierMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.barrierMap,
      roughness: 0.65,
      metalness: 0.12,
    })
  );
  const innerWallGeo = trackGeo(
    buildBarrierWallGeometry(-(WALL_HALF_WIDTH + 0.25), 0.25, 1.15, 7)
  );
  const outerWallGeo = trackGeo(
    buildBarrierWallGeometry(WALL_HALF_WIDTH + 0.25, 0.25, 1.15, 7)
  );
  const innerWall = new THREE.Mesh(innerWallGeo, barrierMat);
  const outerWall = new THREE.Mesh(outerWallGeo, barrierMat);
  innerWall.castShadow = castShadows;
  outerWall.castShadow = castShadows;
  innerWall.receiveShadow = true;
  outerWall.receiveShadow = true;
  scene.add(innerWall, outerWall);

  // 5. Checkered Start/Finish Line Strip at s = 0 (y = 0.04, polygonOffset)
  const startSmp = getTrackSampleAtS(0);
  const startMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.startLineMap,
      roughness: 0.75,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  const startLine = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(TRACK_HALF_WIDTH * 2, 2.8)),
    startMat
  );
  startLine.rotation.x = -Math.PI / 2;
  startLine.rotation.z = Math.atan2(-startSmp.tx, -startSmp.tz);
  startLine.position.set(startSmp.x, 0.04, startSmp.z);
  startLine.receiveShadow = true;
  scene.add(startLine);

  // 6. Start/Finish Timing Gantry Arch (signature tall landmark in spawn view!)
  const steelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x262c36,
      metalness: 0.78,
      roughness: 0.34,
    })
  );
  const gantryGroup = new THREE.Group();
  gantryGroup.position.set(startSmp.x, 0, startSmp.z);
  gantryGroup.rotation.y = Math.atan2(-startSmp.tx, -startSmp.tz);

  const pillarGeo = trackGeo(new THREE.BoxGeometry(0.65, 7.2, 0.65));
  const pillarL = new THREE.Mesh(pillarGeo, steelMat);
  pillarL.position.set(-10.1, 3.6, 0);
  pillarL.castShadow = castShadows;
  const pillarR = new THREE.Mesh(pillarGeo, steelMat);
  pillarR.position.set(10.1, 3.6, 0);
  pillarR.castShadow = castShadows;

  const trussBeam = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(21.2, 1.85, 0.9)),
    steelMat
  );
  trussBeam.position.set(0, 6.9, 0);
  trussBeam.castShadow = castShadows;

  const bannerMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.gantryBannerMap,
      roughness: 0.42,
      metalness: 0.1,
    })
  );
  const bannerFront = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(18.0, 1.55)),
    bannerMat
  );
  bannerFront.position.set(0, 6.9, 0.47);
  const bannerBack = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(18.0, 1.55)),
    bannerMat
  );
  bannerBack.position.set(0, 6.9, -0.47);
  bannerBack.rotation.y = Math.PI;

  gantryGroup.add(pillarL, pillarR, trussBeam, bannerFront, bannerBack);

  // 5 Start Lights mounted inside a dark visor pod on Gantry
  const lightPod = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(6.6, 0.72, 0.48)),
    steelMat
  );
  lightPod.position.set(0, 5.75, 0.28);
  gantryGroup.add(lightPod);

  const startLights: THREE.MeshStandardMaterial[] = [];
  const lightGeo = trackGeo(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 12));
  lightGeo.rotateX(Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const lm = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x15221d,
        emissive: 0x38d9a9,
        emissiveIntensity: 1.6,
        roughness: 0.2,
      })
    );
    startLights.push(lm);
    const bulb = new THREE.Mesh(lightGeo, lm);
    bulb.position.set(-2.4 + i * 1.2, 5.75, 0.52);
    gantryGroup.add(bulb);
  }
  scene.add(gantryGroup);

  // 7. Three Checkpoint Timing Arches (25%, 50%, 75%)
  const sectorBeacons: THREE.MeshStandardMaterial[] = [];
  const cpBeamGeo = trackGeo(new THREE.BoxGeometry(19.6, 0.55, 0.45));
  const cpLegGeo = trackGeo(new THREE.BoxGeometry(0.45, 5.6, 0.45));
  const beaconGeo = trackGeo(new THREE.BoxGeometry(3.2, 0.26, 0.52));

  for (let cp = 1; cp <= 3; cp++) {
    const smp = getTrackSampleAtS((cp / 4) * TRACK_LENGTH);
    const arch = new THREE.Group();
    arch.position.set(smp.x, 0, smp.z);
    arch.rotation.y = Math.atan2(-smp.tx, -smp.tz);

    const legL = new THREE.Mesh(cpLegGeo, steelMat);
    legL.position.set(-9.8, 2.8, 0);
    const legR = new THREE.Mesh(cpLegGeo, steelMat);
    legR.position.set(9.8, 2.8, 0);
    const beam = new THREE.Mesh(cpBeamGeo, steelMat);
    beam.position.set(0, 5.5, 0);

    const beaconMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf59f00,
        emissive: 0xf59f00,
        emissiveIntensity: 0.9,
        roughness: 0.25,
      })
    );
    sectorBeacons.push(beaconMat);
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, 5.1, 0);

    arch.add(legL, legR, beam, beacon);
    scene.add(arch);
  }

  // 8. Grandstand Landmark beside the Main Straight (visible from start camera)
  const standGroup = new THREE.Group();
  const standBaseMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xd8dce2, roughness: 0.78, metalness: 0.1 })
  );
  const standRoofMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.45, metalness: 0.35 })
  );
  const standAccentMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xd92b2b, roughness: 0.6, metalness: 0.1 })
  );

  // Place along x = +15.5, z = -12 (parallel to start straight)
  standGroup.position.set(15.5, 0, -14);
  for (let tier = 0; tier < 4; tier++) {
    const step = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(2.0, 1.1, 32)),
      tier % 2 === 0 ? standBaseMat : standAccentMat
    );
    step.position.set(tier * 1.4, 0.55 + tier * 0.95, 0);
    step.castShadow = castShadows;
    step.receiveShadow = true;
    standGroup.add(step);
  }
  const canopy = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(7.2, 0.35, 33)),
    standRoofMat
  );
  canopy.position.set(2.4, 7.1, 0);
  canopy.rotation.z = -0.14;
  canopy.castShadow = castShadows;
  standGroup.add(canopy);
  for (let p = -14; p <= 14; p += 7) {
    const post = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.18, 0.18, 7.2, 8)),
      steelMat
    );
    post.position.set(5.4, 3.6, p);
    standGroup.add(post);
  }
  scene.add(standGroup);

  // 9. Instanced Mediterranean Cypress & Pine Trees (composite trunks + crowns, safe outside track!)
  const treeCoords: { x: number; z: number; scale: number; isCypress: boolean }[] = [];
  let treeSeed = 4242;
  const trand = () => {
    treeSeed = (treeSeed * 16807) % 2147483647;
    return (treeSeed - 1) / 2147483646;
  };
  for (let attempt = 0; attempt < 420 && treeCoords.length < 130; attempt++) {
    const x = -195 + trand() * 295;
    const z = -185 + trand() * 365;
    // Keep clear of grandstands
    if (x > 9 && x < 27 && z > -36 && z < 8) continue;
    const closest = findClosestTrackSample(x, z);
    if (Math.sqrt(closest.distSq) < WALL_HALF_WIDTH + 6.5) continue;
    treeCoords.push({
      x,
      z,
      scale: 0.85 + trand() * 0.35,
      isCypress: trand() > 0.45,
    });
  }

  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.22, 0.34, 2.2, 8));
  trunkGeo.translate(0, 1.1, 0);
  const trunkMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x5e432c, roughness: 0.9 })
  );
  const crownGeo = trackGeo(new THREE.ConeGeometry(1.75, 5.6, 10));
  crownGeo.translate(0, 4.4, 0);
  const crownMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 })
  );

  const treeCount = treeCoords.length;
  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const crownInst = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);
  trunkInst.castShadow = castShadows;
  crownInst.castShadow = castShadows;
  crownInst.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  for (let i = 0; i < treeCount; i++) {
    const tc = treeCoords[i];
    dummy.position.set(tc.x, 0, tc.z);
    dummy.rotation.set(0, trand() * Math.PI * 2, 0);
    const sx = tc.isCypress ? tc.scale * 0.72 : tc.scale * 1.15;
    const sy = tc.isCypress ? tc.scale * 1.35 : tc.scale * 0.95;
    dummy.scale.set(sx, sy, sx);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);
    crownInst.setMatrixAt(i, dummy.matrix);

    const gVal = 0.25 + trand() * 0.14;
    tint.setRGB(0.08 + trand() * 0.05, gVal, 0.09 + trand() * 0.04);
    crownInst.setColorAt(i, tint);
  }
  trunkInst.instanceMatrix.needsUpdate = true;
  crownInst.instanceMatrix.needsUpdate = true;
  if (crownInst.instanceColor) crownInst.instanceColor.needsUpdate = true;
  trunkInst.computeBoundingSphere();
  crownInst.computeBoundingSphere();
  scene.add(trunkInst, crownInst);

  // 10. Instanced Trackside Light Poles along the circuit perimeter
  const poleCount = 24;
  const poleGeo = trackGeo(new THREE.CylinderGeometry(0.12, 0.16, 7.0, 8));
  poleGeo.translate(0, 3.5, 0);
  const poleInst = new THREE.InstancedMesh(poleGeo, steelMat, poleCount);
  const lampGeo = trackGeo(new THREE.BoxGeometry(1.1, 0.18, 0.36));
  const lampMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff3d1,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    })
  );
  const lampInst = new THREE.InstancedMesh(lampGeo, lampMat, poleCount);

  for (let i = 0; i < poleCount; i++) {
    const s = ((i + 0.5) / poleCount) * TRACK_LENGTH;
    const smp = getTrackSampleAtS(s);
    const side = i % 2 === 0 ? -1 : 1;
    const px = smp.x + smp.nx * side * (WALL_HALF_WIDTH + 1.4);
    const pz = smp.z + smp.nz * side * (WALL_HALF_WIDTH + 1.4);
    const yaw = Math.atan2(smp.nx * -side, smp.nz * -side);

    dummy.position.set(px, 0, pz);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poleInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(px - smp.nx * side * 0.45, 7.0, pz - smp.nz * side * 0.45);
    dummy.rotation.set(0, yaw + Math.PI / 2, 0);
    dummy.updateMatrix();
    lampInst.setMatrixAt(i, dummy.matrix);
  }
  poleInst.instanceMatrix.needsUpdate = true;
  lampInst.instanceMatrix.needsUpdate = true;
  poleInst.computeBoundingSphere();
  lampInst.computeBoundingSphere();
  scene.add(poleInst, lampInst);

  // 11. Distant Coastal Horizon Hills Ring (no empty void!)
  const hillMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5a7f4c,
      roughness: 0.95,
      metalness: 0.0,
    })
  );
  const hillCount = 26;
  const hillGeo = trackGeo(new THREE.ConeGeometry(48, 34, 9));
  hillGeo.translate(0, 14, 0);
  const hillInst = new THREE.InstancedMesh(hillGeo, hillMat, hillCount);
  for (let i = 0; i < hillCount; i++) {
    const angle = (i / hillCount) * Math.PI * 2;
    const dist = 235 + (i % 3) * 24;
    dummy.position.set(Math.cos(angle) * dist - 40, -2, Math.sin(angle) * dist);
    dummy.rotation.set(0, angle, 0);
    dummy.scale.set(1.2 + (i % 2) * 0.5, 0.75 + (i % 3) * 0.35, 1.0);
    dummy.updateMatrix();
    hillInst.setMatrixAt(i, dummy.matrix);
  }
  hillInst.instanceMatrix.needsUpdate = true;
  hillInst.computeBoundingSphere();
  scene.add(hillInst);

  // 12. Zero-GC Pooled Particle Ring Buffer (tire smoke & barrier sparks)
  const MAX_PARTICLES = 96;
  const pGeo = trackGeo(new THREE.IcosahedronGeometry(0.32, 1));
  const pMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
    })
  );
  const pInst = new THREE.InstancedMesh(pGeo, pMat, MAX_PARTICLES);
  pInst.frustumCulled = false;

  const pActive = new Uint8Array(MAX_PARTICLES);
  const pX = new Float32Array(MAX_PARTICLES);
  const pY = new Float32Array(MAX_PARTICLES);
  const pZ = new Float32Array(MAX_PARTICLES);
  const pVx = new Float32Array(MAX_PARTICLES);
  const pVy = new Float32Array(MAX_PARTICLES);
  const pVz = new Float32Array(MAX_PARTICLES);
  const pSize = new Float32Array(MAX_PARTICLES);
  const pLife = new Float32Array(MAX_PARTICLES);
  const pMaxLife = new Float32Array(MAX_PARTICLES);
  let pCursor = 0;

  const pDummy = new THREE.Object3D();
  const pColor = new THREE.Color();
  for (let i = 0; i < MAX_PARTICLES; i++) {
    pDummy.scale.set(0, 0, 0);
    pDummy.updateMatrix();
    pInst.setMatrixAt(i, pDummy.matrix);
    pInst.setColorAt(i, pColor.setHex(0xffffff));
  }
  pInst.instanceMatrix.needsUpdate = true;
  if (pInst.instanceColor) pInst.instanceColor.needsUpdate = true;
  scene.add(pInst);

  const emitParticle = (
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    size: number,
    life: number,
    colorHex: number
  ) => {
    const idx = pCursor;
    pCursor = (pCursor + 1) % MAX_PARTICLES;
    pActive[idx] = 1;
    pX[idx] = x;
    pY[idx] = y;
    pZ[idx] = z;
    pVx[idx] = vx;
    pVy[idx] = vy;
    pVz[idx] = vz;
    pSize[idx] = size;
    pLife[idx] = life;
    pMaxLife[idx] = life;
    pColor.setHex(colorHex);
    pInst.setColorAt(idx, pColor);
    if (pInst.instanceColor) pInst.instanceColor.needsUpdate = true;
  };

  const updateParticles = (dt: number) => {
    let anyChanged = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!pActive[i]) continue;
      anyChanged = true;
      pLife[i] -= dt;
      if (pLife[i] <= 0) {
        pActive[i] = 0;
        pDummy.scale.set(0, 0, 0);
        pDummy.updateMatrix();
        pInst.setMatrixAt(i, pDummy.matrix);
        continue;
      }
      pX[i] += pVx[i] * dt;
      pY[i] += pVy[i] * dt;
      pZ[i] += pVz[i] * dt;
      pVy[i] -= 2.5 * dt;
      const t = pLife[i] / pMaxLife[i];
      const s = pSize[i] * (0.4 + 0.9 * (1 - t)) * Math.min(1, t * 2.5);
      pDummy.position.set(pX[i], Math.max(0.05, pY[i]), pZ[i]);
      pDummy.scale.set(s, s, s);
      pDummy.updateMatrix();
      pInst.setMatrixAt(i, pDummy.matrix);
    }
    if (anyChanged) {
      pInst.instanceMatrix.needsUpdate = true;
    }
  };

  const beaconTimers = [0, 0, 0];
  const updateEffects = (checkpointReached: number | null, dt: number) => {
    if (checkpointReached !== null && checkpointReached >= 1 && checkpointReached <= 3) {
      beaconTimers[checkpointReached - 1] = 1.6;
    }
    for (let i = 0; i < 3; i++) {
      if (beaconTimers[i] > 0) {
        beaconTimers[i] = Math.max(0, beaconTimers[i] - dt);
        sectorBeacons[i].color.setHex(0x38d9a9);
        sectorBeacons[i].emissive.setHex(0x38d9a9);
        sectorBeacons[i].emissiveIntensity = 2.4;
      } else {
        sectorBeacons[i].color.setHex(0xf59f00);
        sectorBeacons[i].emissive.setHex(0xf59f00);
        sectorBeacons[i].emissiveIntensity = 0.85;
      }
    }
  };

  return {
    startLights,
    sectorBeacons,
    emitParticle,
    updateParticles,
    updateEffects,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
