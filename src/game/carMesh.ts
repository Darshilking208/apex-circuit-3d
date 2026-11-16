import * as THREE from 'three';
import { CarState } from './carPhysics';

export interface RaceCarRig {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  frontLeftPivot: THREE.Group;
  frontRightPivot: THREE.Group;
  wheelMeshes: THREE.Object3D[];
  brakeLightMat: THREE.MeshStandardMaterial;
  reverseLightMat: THREE.MeshStandardMaterial;
  dispose: () => void;
}

/**
 * Builds a composite 10-part GT race car pivoted at bottom-center (y = 0 at tire contact patch),
 * facing forward along -Z in local coordinates.
 */
export function createRaceCarRig(
  contactShadowMap: THREE.Texture,
  castShadow: boolean
): RaceCarRig {
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

  const root = new THREE.Group();
  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

  // Materials with clear roughness & metalness differentiation (>= 0.25 contrast)
  const bodyPaintMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xd92626, // Rosso Corsa motorsport crimson
      metalness: 0.62,
      roughness: 0.22,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    })
  );

  const racingStripeMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xf4f5f7,
      metalness: 0.25,
      roughness: 0.24,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
    })
  );

  const carbonMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1b1e24,
      metalness: 0.15,
      roughness: 0.78,
    })
  );

  const canopyGlassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x111722,
      metalness: 0.12,
      roughness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
    })
  );

  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1a1c20,
      metalness: 0.04,
      roughness: 0.88,
    })
  );

  const alloyRimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd8dde6,
      metalness: 0.92,
      roughness: 0.18,
    })
  );

  const caliperMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59f00,
      metalness: 0.4,
      roughness: 0.35,
    })
  );

  const headlightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff6dc,
      emissiveIntensity: 1.8,
      roughness: 0.15,
    })
  );

  const brakeLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x700c0c,
      emissive: 0xff1e1e,
      emissiveIntensity: 0.65,
      roughness: 0.25,
    })
  );

  const reverseLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd0d4dc,
      emissive: 0xffffff,
      emissiveIntensity: 0.0,
      roughness: 0.2,
    })
  );

  // Soft radial contact shadow plane at y = 0.015 (does not tilt with chassis)
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: contactShadowMap,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
  );
  const shadowDisc = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(2.65, 4.9)),
    shadowMat
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.set(0, 0.015, 0);
  root.add(shadowDisc);

  // 1. Primary Silhouette: Sculpted Aerodynamic GT Chassis (ExtrudeGeometry side profile)
  // Shape in XY where +X = forward (-Z in world), +Y = up
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-2.12, 0.26); // rear lower edge
  bodyShape.lineTo(2.15, 0.22);  // front splitter edge
  bodyShape.lineTo(2.22, 0.36);  // nose tip
  bodyShape.quadraticCurveTo(1.75, 0.66, 0.85, 0.72); // sloped front hood
  bodyShape.lineTo(-0.75, 0.76); // beltline / engine deck
  bodyShape.lineTo(-2.08, 0.72); // rear tail deck
  bodyShape.lineTo(-2.16, 0.36); // rear fascia
  bodyShape.closePath();

  const bodyGeo = trackGeo(
    new THREE.ExtrudeGeometry(bodyShape, {
      depth: 1.72,
      bevelEnabled: true,
      bevelThickness: 0.09,
      bevelSize: 0.07,
      bevelSegments: 3,
      curveSegments: 12,
    })
  );
  // Center along extrusion Z, then rotate so local +X -> -Z (forward)
  bodyGeo.translate(0, 0, -0.86);
  bodyGeo.rotateY(Math.PI / 2);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyPaintMat);
  bodyMesh.castShadow = castShadow;
  bodyMesh.receiveShadow = true;
  chassisGroup.add(bodyMesh);

  // Center twin racing stripes along hood & deck
  const stripeGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.025, 3.85));
  const stripeL = new THREE.Mesh(stripeGeo, racingStripeMat);
  stripeL.position.set(-0.14, 0.78, -0.1);
  const stripeR = new THREE.Mesh(stripeGeo, racingStripeMat);
  stripeR.position.set(0.14, 0.78, -0.1);
  chassisGroup.add(stripeL, stripeR);

  // 2. Cockpit Canopy / Greenhouse (tapered extruded greenhouse)
  const canopyShape = new THREE.Shape();
  canopyShape.moveTo(-0.98, 0.72);
  canopyShape.lineTo(0.88, 0.70);
  canopyShape.quadraticCurveTo(0.45, 1.12, 0.12, 1.15);
  canopyShape.lineTo(-0.56, 1.13);
  canopyShape.quadraticCurveTo(-0.85, 0.96, -0.98, 0.72);
  canopyShape.closePath();

  const canopyGeo = trackGeo(
    new THREE.ExtrudeGeometry(canopyShape, {
      depth: 1.24,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.06,
      bevelSegments: 3,
    })
  );
  canopyGeo.translate(0, 0, -0.62);
  canopyGeo.rotateY(Math.PI / 2);
  const canopyMesh = new THREE.Mesh(canopyGeo, canopyGlassMat);
  canopyMesh.castShadow = castShadow;
  chassisGroup.add(canopyMesh);

  // Roof paint cap for crisp two-tone GT silhouette
  const roofCap = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.12, 0.05, 0.85)),
    bodyPaintMat
  );
  roofCap.position.set(0, 1.19, 0.16);
  chassisGroup.add(roofCap);

  // 3. Carbon Fiber Front Splitter, Side Skirts & Rear Diffuser
  const splitter = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.94, 0.07, 0.56)),
    carbonMat
  );
  splitter.position.set(0, 0.18, -2.06);
  splitter.castShadow = castShadow;
  chassisGroup.add(splitter);

  const skirtGeo = trackGeo(new THREE.BoxGeometry(0.12, 0.12, 2.35));
  const skirtL = new THREE.Mesh(skirtGeo, carbonMat);
  skirtL.position.set(-0.94, 0.21, 0);
  const skirtR = new THREE.Mesh(skirtGeo, carbonMat);
  skirtR.position.set(0.94, 0.21, 0);
  chassisGroup.add(skirtL, skirtR);

  const diffuser = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.76, 0.16, 0.36)),
    carbonMat
  );
  diffuser.position.set(0, 0.22, 2.02);
  chassisGroup.add(diffuser);

  // 4. GT Rear Wing Assembly (twin struts + curved wing blade + endplates)
  const wingGroup = new THREE.Group();
  const strutGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.34, 0.22));
  const strutL = new THREE.Mesh(strutGeo, carbonMat);
  strutL.position.set(-0.48, 0.91, 1.88);
  const strutR = new THREE.Mesh(strutGeo, carbonMat);
  strutR.position.set(0.48, 0.91, 1.88);

  const wingBlade = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.88, 0.055, 0.34)),
    carbonMat
  );
  wingBlade.position.set(0, 1.09, 1.94);
  wingBlade.rotation.x = 0.12; // downforce angle
  wingBlade.castShadow = castShadow;

  const endplateGeo = trackGeo(new THREE.BoxGeometry(0.04, 0.22, 0.42));
  const endplateL = new THREE.Mesh(endplateGeo, bodyPaintMat);
  endplateL.position.set(-0.95, 1.08, 1.94);
  const endplateR = new THREE.Mesh(endplateGeo, bodyPaintMat);
  endplateR.position.set(0.95, 1.08, 1.94);

  wingGroup.add(strutL, strutR, wingBlade, endplateL, endplateR);
  chassisGroup.add(wingGroup);

  // 5. Headlights, Taillight Bar, Dual Chrome Exhausts & Side Mirrors
  const headlightGeo = trackGeo(new THREE.BoxGeometry(0.34, 0.1, 0.12));
  const hlLeft = new THREE.Mesh(headlightGeo, headlightMat);
  hlLeft.position.set(-0.62, 0.48, -2.14);
  const hlRight = new THREE.Mesh(headlightGeo, headlightMat);
  hlRight.position.set(0.62, 0.48, -2.14);
  chassisGroup.add(hlLeft, hlRight);

  // Dark carbon rear fascia recess framing the LED taillight bar (outside 0.09 bevel)
  const rearFascia = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.66, 0.24, 0.06)),
    carbonMat
  );
  rearFascia.position.set(0, 0.54, 2.22);
  chassisGroup.add(rearFascia);

  const taillightBar = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.56, 0.085, 0.05)),
    brakeLightMat
  );
  taillightBar.position.set(0, 0.57, 2.245);
  chassisGroup.add(taillightBar);

  const reverseLamp = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.30, 0.05, 0.05)),
    reverseLightMat
  );
  reverseLamp.position.set(0, 0.45, 2.245);
  chassisGroup.add(reverseLamp);

  // Subtle wheel-arch carbon lip trim over all 4 wheels
  const archGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.12, 0.74));
  const archPositions: [number, number, number][] = [
    [-0.90, 0.47, -1.32],
    [0.90, 0.47, -1.32],
    [-0.91, 0.47, 1.32],
    [0.91, 0.47, 1.32],
  ];
  for (const [ax, ay, az] of archPositions) {
    const arch = new THREE.Mesh(archGeo, carbonMat);
    arch.position.set(ax, ay, az);
    chassisGroup.add(arch);
  }

  const exhaustGeo = trackGeo(new THREE.CylinderGeometry(0.06, 0.065, 0.22, 12));
  exhaustGeo.rotateX(Math.PI / 2);
  const exL = new THREE.Mesh(exhaustGeo, alloyRimMat);
  exL.position.set(-0.42, 0.24, 2.22);
  const exR = new THREE.Mesh(exhaustGeo, alloyRimMat);
  exR.position.set(0.42, 0.24, 2.22);
  chassisGroup.add(exL, exR);

  // Side mirrors
  const mirrorGeo = trackGeo(new THREE.BoxGeometry(0.22, 0.09, 0.14));
  const mirrorL = new THREE.Mesh(mirrorGeo, bodyPaintMat);
  mirrorL.position.set(-0.92, 0.84, -0.42);
  const mirrorR = new THREE.Mesh(mirrorGeo, bodyPaintMat);
  mirrorR.position.set(0.92, 0.84, -0.42);
  chassisGroup.add(mirrorL, mirrorR);

  // 6. Four Articulated Wheel Assemblies (radius = 0.36m, centered at y = 0.36 so tire touches y = 0!)
  const wheelRadius = 0.36;
  const wheelWidth = 0.30;

  // Profiled tire via LatheGeometry
  const tirePts = [
    new THREE.Vector2(0.21, -wheelWidth * 0.5),
    new THREE.Vector2(0.33, -wheelWidth * 0.48),
    new THREE.Vector2(wheelRadius, -wheelWidth * 0.35),
    new THREE.Vector2(wheelRadius, wheelWidth * 0.35),
    new THREE.Vector2(0.33, wheelWidth * 0.48),
    new THREE.Vector2(0.21, wheelWidth * 0.5),
  ];
  const tireGeo = trackGeo(new THREE.LatheGeometry(tirePts, 24));
  tireGeo.rotateZ(Math.PI / 2); // Align axle along X

  const rimDrumGeo = trackGeo(new THREE.CylinderGeometry(0.22, 0.22, wheelWidth * 0.82, 16));
  rimDrumGeo.rotateZ(Math.PI / 2);

  const spokeGeo = trackGeo(new THREE.BoxGeometry(0.05, 0.39, 0.045));
  const hubGeo = trackGeo(new THREE.CylinderGeometry(0.06, 0.06, wheelWidth * 0.92, 10));
  hubGeo.rotateZ(Math.PI / 2);
  const caliperGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.14, 0.10));

  const wheelMeshes: THREE.Object3D[] = [];

  const createWheel = (isLeft: boolean): { spinGroup: THREE.Group; caliper: THREE.Mesh } => {
    const spinGroup = new THREE.Group();

    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = castShadow;
    spinGroup.add(tire);

    const drum = new THREE.Mesh(rimDrumGeo, alloyRimMat);
    spinGroup.add(drum);

    const hub = new THREE.Mesh(hubGeo, alloyRimMat);
    spinGroup.add(hub);

    const spokeOffsetX = isLeft ? -wheelWidth * 0.41 : wheelWidth * 0.41;
    for (let i = 0; i < 5; i++) {
      const spoke = new THREE.Mesh(spokeGeo, alloyRimMat);
      spoke.position.x = spokeOffsetX;
      spoke.rotation.x = (i * Math.PI) / 5;
      spinGroup.add(spoke);
    }

    const caliper = new THREE.Mesh(caliperGeo, caliperMat);
    caliper.position.set(isLeft ? -0.05 : 0.05, 0.04, 0.12);

    wheelMeshes.push(spinGroup);
    return { spinGroup, caliper };
  };

  const frontLeftPivot = new THREE.Group();
  frontLeftPivot.position.set(-0.85, wheelRadius, -1.32);
  const fl = createWheel(true);
  frontLeftPivot.add(fl.spinGroup, fl.caliper);
  root.add(frontLeftPivot);

  const frontRightPivot = new THREE.Group();
  frontRightPivot.position.set(0.85, wheelRadius, -1.32);
  const fr = createWheel(false);
  frontRightPivot.add(fr.spinGroup, fr.caliper);
  root.add(frontRightPivot);

  const rearLeftAnchor = new THREE.Group();
  rearLeftAnchor.position.set(-0.87, wheelRadius, 1.32);
  const rl = createWheel(true);
  rearLeftAnchor.add(rl.spinGroup, rl.caliper);
  root.add(rearLeftAnchor);

  const rearRightAnchor = new THREE.Group();
  rearRightAnchor.position.set(0.87, wheelRadius, 1.32);
  const rr = createWheel(false);
  rearRightAnchor.add(rr.spinGroup, rr.caliper);
  root.add(rearRightAnchor);

  return {
    root,
    chassisGroup,
    frontLeftPivot,
    frontRightPivot,
    wheelMeshes,
    brakeLightMat,
    reverseLightMat,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

export function syncCarRigToPhysics(rig: RaceCarRig, car: CarState): void {
  rig.root.position.set(car.x, 0, car.z);
  rig.root.rotation.y = car.heading;

  // Suspension pitch & roll on chassis body
  rig.chassisGroup.rotation.x = car.bodyPitch;
  rig.chassisGroup.rotation.z = car.bodyRoll;

  // Front wheel steering pivots
  rig.frontLeftPivot.rotation.y = car.steerAngle;
  rig.frontRightPivot.rotation.y = car.steerAngle;

  // Spin all 4 wheels around local X (-X rotation rolls forward toward -Z)
  for (let i = 0; i < rig.wheelMeshes.length; i++) {
    rig.wheelMeshes[i].rotation.x = -car.wheelSpin;
  }

  // Dynamic brake & reverse light intensity
  rig.brakeLightMat.emissiveIntensity = car.isBraking ? 3.2 : 0.65;
  rig.reverseLightMat.emissiveIntensity = car.isReversing ? 2.4 : 0.0;
}
