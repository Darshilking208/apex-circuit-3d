import {
  TRACK_HALF_WIDTH,
  clampToTrackBarriers,
  findClosestTrackSample,
  getTrackSampleAtS,
} from './track';

export interface CarControls {
  accelerate: boolean;
  brakeReverse: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  handbrake: boolean;
}

export interface CarState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;      // radians: 0 => facing -Z (0, -1), +PI/2 => facing -X (-1, 0)
  speed: number;        // signed forward speed (m/s)
  speedKmh: number;     // display speed (km/h, >= 0)
  steerAngle: number;   // front wheel angle (radians, + = left)
  wheelSpin: number;    // cumulative wheel rotation (radians)
  bodyRoll: number;     // chassis roll angle (radians)
  bodyPitch: number;    // chassis pitch angle (radians)
  lateralSlip: number;  // magnitude of lateral sliding speed (m/s)
  isBraking: boolean;
  isReversing: boolean;
  onRumbleStrip: boolean;
  hitBarrier: boolean;
  impactSpeed: number;
  trackS: number;
  lateralOffset: number;
}

export const CAR_PHYSICS_CONFIG = {
  maxForwardSpeed: 54,    // m/s (~194 km/h)
  maxReverseSpeed: 18,    // m/s (~65 km/h)
  accelForce: 34,         // m/s^2
  brakeDecel: 48,         // m/s^2
  reverseAccel: 22,       // m/s^2
  coastDrag: 0.42,        // aerodynamic + rolling drag
  maxSteerAngle: 0.52,    // radians (~30 deg)
  steerRate: 4.4,         // rad/s
  steerReturnRate: 7.2,   // rad/s
  turnRateScale: 2.55,    // steering responsiveness
  lateralGrip: 8.8,       // lateral damping coefficient
  driftLateralGrip: 2.8,  // reduced grip under handbrake
  kerbSpeedFactor: 0.94,  // slight drag off asphalt
  carRadius: 1.15,
  wheelRadius: 0.36,
};

export function createInitialCarState(startS = 0): CarState {
  const sample = getTrackSampleAtS(startS);
  // heading 0 points along (0, -1) => forward = (-sin(h), -cos(h))
  // So heading = atan2(-tx, -tz)
  const heading = Math.atan2(-sample.tx, -sample.tz);
  return {
    x: sample.x,
    z: sample.z,
    vx: 0,
    vz: 0,
    heading,
    speed: 0,
    speedKmh: 0,
    steerAngle: 0,
    wheelSpin: 0,
    bodyRoll: 0,
    bodyPitch: 0,
    lateralSlip: 0,
    isBraking: false,
    isReversing: false,
    onRumbleStrip: false,
    hitBarrier: false,
    impactSpeed: 0,
    trackS: sample.s,
    lateralOffset: 0,
  };
}

export function resetCarToNearestTrack(car: CarState): void {
  const info = findClosestTrackSample(car.x, car.z);
  car.x = info.x;
  car.z = info.z;
  car.vx = 0;
  car.vz = 0;
  car.speed = 0;
  car.speedKmh = 0;
  car.heading = Math.atan2(-info.tx, -info.tz);
  car.steerAngle = 0;
  car.bodyRoll = 0;
  car.bodyPitch = 0;
  car.lateralSlip = 0;
  car.isBraking = false;
  car.isReversing = false;
  car.hitBarrier = false;
  car.impactSpeed = 0;
  car.trackS = info.s;
  car.lateralOffset = 0;
}

export function stepCarPhysics(
  car: CarState,
  controls: CarControls,
  dt: number
): void {
  const cfg = CAR_PHYSICS_CONFIG;

  // Forward unit vector in XZ when heading=0 => (0, -1)
  // Left turn (+heading) rotates (0, -1) toward (-1, 0) => (-sin(h), -cos(h))
  const fwdX = -Math.sin(car.heading);
  const fwdZ = -Math.cos(car.heading);
  // Right unit vector => (cos(h), -sin(h))
  const rightX = Math.cos(car.heading);
  const rightZ = -Math.sin(car.heading);

  // Decompose current world velocity into car local frame
  let vForward = car.vx * fwdX + car.vz * fwdZ;
  let vLateral = car.vx * rightX + car.vz * rightZ;

  // Smooth steering wheel angle
  let targetSteer = 0;
  if (controls.steerLeft) targetSteer += 1;
  if (controls.steerRight) targetSteer -= 1;

  // Speed-sensitive steering limit for high-speed stability
  const speedRatio = Math.min(1, Math.abs(vForward) / cfg.maxForwardSpeed);
  const maxSteerAtSpeed = cfg.maxSteerAngle * (1 - 0.38 * speedRatio);
  const desiredSteer = targetSteer * maxSteerAtSpeed;

  if (targetSteer !== 0) {
    const alpha = 1 - Math.exp(-cfg.steerRate * 2.5 * dt);
    car.steerAngle += (desiredSteer - car.steerAngle) * alpha;
  } else {
    const alpha = 1 - Math.exp(-cfg.steerReturnRate * dt);
    car.steerAngle += (0 - car.steerAngle) * alpha;
  }

  // Acceleration, braking & reverse
  let longAccel = 0;
  car.isBraking = false;
  car.isReversing = false;

  if (controls.accelerate) {
    if (vForward < -1.0) {
      // Braking out of reverse
      longAccel = cfg.brakeDecel;
      car.isBraking = true;
    } else {
      // Torque tapers smoothly near top speed
      const torqueCurve = 1 - 0.55 * Math.pow(Math.max(0, vForward) / cfg.maxForwardSpeed, 1.6);
      longAccel = cfg.accelForce * Math.max(0.15, torqueCurve);
    }
  } else if (controls.brakeReverse) {
    if (vForward > 1.2) {
      // Active braking
      longAccel = -cfg.brakeDecel;
      car.isBraking = true;
    } else {
      // Reverse gear
      const revCurve = 1 - Math.min(1, Math.abs(Math.min(0, vForward)) / cfg.maxReverseSpeed);
      longAccel = -cfg.reverseAccel * Math.max(0.1, revCurve);
      car.isReversing = true;
    }
  }

  if (controls.handbrake && Math.abs(vForward) > 0.5) {
    longAccel -= Math.sign(vForward) * 14;
    car.isBraking = true;
  }

  // Apply longitudinal acceleration & aerodynamic drag
  vForward += longAccel * dt;
  const dragFactor = Math.exp(-cfg.coastDrag * dt);
  if (!controls.accelerate && !controls.brakeReverse) {
    vForward *= Math.exp(-0.95 * dt);
    if (Math.abs(vForward) < 0.08) vForward = 0;
  } else {
    vForward *= dragFactor;
  }

  // Roughness drag on kerbs/off-asphalt
  if (car.onRumbleStrip) {
    vForward *= Math.pow(cfg.kerbSpeedFactor, dt * 10);
  }

  vForward = Math.max(-cfg.maxReverseSpeed, Math.min(cfg.maxForwardSpeed, vForward));

  // Steering angular rotation (bicycle model scaled by speed)
  const absSpeed = Math.abs(vForward);
  const steerSpeedFactor =
    absSpeed < 0.25 ? 0 : Math.min(1, absSpeed / 7.5);
  const reverseSign = vForward >= -0.05 ? 1 : -1;
  const driftTurnBoost = controls.handbrake ? 1.32 : 1.0;
  const yawRate =
    car.steerAngle *
    cfg.turnRateScale *
    steerSpeedFactor *
    driftTurnBoost *
    reverseSign;

  car.heading += yawRate * dt;

  // Lateral tyre grip damping (aligned to updated heading)
  const grip = controls.handbrake ? cfg.driftLateralGrip : cfg.lateralGrip;
  // Slightly transfer forward momentum through turn without instant sideways slide
  vLateral *= Math.exp(-grip * dt);

  // Reconstruct world velocity along updated heading
  const newFwdX = -Math.sin(car.heading);
  const newFwdZ = -Math.cos(car.heading);
  const newRightX = Math.cos(car.heading);
  const newRightZ = -Math.sin(car.heading);

  const worldVx = newFwdX * vForward + newRightX * vLateral;
  const worldVz = newFwdZ * vForward + newRightZ * vLateral;

  const nextX = car.x + worldVx * dt;
  const nextZ = car.z + worldVz * dt;

  // Barrier collision clamping
  const clamped = clampToTrackBarriers(
    nextX,
    nextZ,
    worldVx,
    worldVz,
    cfg.carRadius
  );

  car.x = clamped.x;
  car.z = clamped.z;
  car.vx = clamped.vx;
  car.vz = clamped.vz;
  car.hitBarrier = clamped.hitBarrier;
  car.impactSpeed = clamped.impactSpeed;
  car.trackS = clamped.trackInfo.s;
  car.lateralOffset = clamped.lateralOffset;
  car.onRumbleStrip = Math.abs(clamped.lateralOffset) > TRACK_HALF_WIDTH - 0.4;

  // Recompute final speeds & visual suspension states
  car.speed = car.vx * newFwdX + car.vz * newFwdZ;
  car.speedKmh = Math.round(Math.abs(car.speed) * 3.6);
  car.lateralSlip = Math.abs(car.vx * newRightX + car.vz * newRightZ);
  car.wheelSpin += (car.speed * dt) / cfg.wheelRadius;

  // Suspension pitch (squat on accel, dive on brake) & corner roll
  const targetPitch = Math.max(-0.045, Math.min(0.045, -longAccel * 0.0011));
  const targetRoll = Math.max(
    -0.07,
    Math.min(0.07, yawRate * Math.min(1, absSpeed / 25) * 0.045)
  );
  const suspAlpha = 1 - Math.exp(-10 * dt);
  car.bodyPitch += (targetPitch - car.bodyPitch) * suspAlpha;
  car.bodyRoll += (targetRoll - car.bodyRoll) * suspAlpha;
}
