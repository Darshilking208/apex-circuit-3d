import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACK_LENGTH,
  TRACK_SAMPLES,
  WALL_HALF_WIDTH,
  clampToTrackBarriers,
  findClosestTrackSample,
  getTrackSampleAtS,
} from './track';
import {
  createInitialCarState,
  resetCarToNearestTrack,
  stepCarPhysics,
} from './carPhysics';
import {
  TOTAL_LAPS,
  createInitialRaceState,
  formatRaceTime,
  stepRaceRules,
} from './raceRules';

test('closed track loop has valid length and no self-intersections', () => {
  assert.ok(TRACK_LENGTH > 350, `Expected track length > 350m, got ${TRACK_LENGTH}`);
  assert.equal(TRACK_SAMPLES.length, 480);

  // Verify non-adjacent samples stay well clear of barrier envelope (2 * WALL_HALF_WIDTH = 18.4m)
  const n = TRACK_SAMPLES.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 45; j < n - 45; j++) {
      const a = TRACK_SAMPLES[i];
      const b = TRACK_SAMPLES[j];
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(
        dist > WALL_HALF_WIDTH * 2 + 2,
        `Track samples ${i} and ${j} too close (${dist.toFixed(2)}m)`
      );
    }
  }
});

test('car spawns on open track facing forward (-Z) and stays stationary without input', () => {
  const car = createInitialCarState(0);
  const neutral = {
    accelerate: false,
    brakeReverse: false,
    steerLeft: false,
    steerRight: false,
    handbrake: false,
  };
  for (let i = 0; i < 60; i++) {
    stepCarPhysics(car, neutral, 1 / 60);
  }
  assert.equal(car.speedKmh, 0);
  assert.ok(Math.abs(car.lateralOffset) < 0.1);
});

test('acceleration, braking/reverse, and steering respond smoothly', () => {
  const car = createInitialCarState(0);
  const accel = {
    accelerate: true,
    brakeReverse: false,
    steerLeft: false,
    steerRight: false,
    handbrake: false,
  };
  for (let i = 0; i < 120; i++) {
    stepCarPhysics(car, accel, 1 / 60);
  }
  assert.ok(car.speed > 30, `Expected forward speed > 30 m/s, got ${car.speed}`);
  assert.ok(car.wheelSpin > 5, 'Wheels should spin while driving');

  // Steer left and verify heading + front steerAngle turn positive
  const steerLeft = { ...accel, steerLeft: true };
  const initialHeading = car.heading;
  for (let i = 0; i < 30; i++) {
    stepCarPhysics(car, steerLeft, 1 / 60);
  }
  assert.ok(car.steerAngle > 0.1, 'Front wheels should angle left');
  assert.ok(car.heading > initialHeading, 'Car heading should turn left');

  // Brake to a stop and engage reverse from moderate speed on straight
  const revCar = createInitialCarState(0);
  for (let i = 0; i < 45; i++) {
    stepCarPhysics(revCar, accel, 1 / 60);
  }
  assert.ok(revCar.speed > 15, 'Should accelerate forward');

  const brakeRev = {
    accelerate: false,
    brakeReverse: true,
    steerLeft: false,
    steerRight: false,
    handbrake: false,
  };
  for (let i = 0; i < 150; i++) {
    stepCarPhysics(revCar, brakeRev, 1 / 60);
  }
  assert.ok(revCar.speed < -5, `Expected reverse speed < -5 m/s, got ${revCar.speed}`);
  assert.equal(revCar.isReversing, true);
});

test('barriers clamp car inside walls and bounce velocity inward', () => {
  const smp = getTrackSampleAtS(0);
  const farRightX = smp.x + smp.nx * (WALL_HALF_WIDTH + 4);
  const farRightZ = smp.z + smp.nz * (WALL_HALF_WIDTH + 4);

  const res = clampToTrackBarriers(
    farRightX,
    farRightZ,
    smp.nx * 20 + smp.tx * 25,
    smp.nz * 20 + smp.tz * 25,
    1.15
  );
  assert.equal(res.hitBarrier, true);
  assert.ok(Math.abs(res.lateralOffset) <= WALL_HALF_WIDTH - 1.15 + 0.001);
  // Outward normal velocity should be reversed inward
  const newNormVel = res.vx * smp.nx + res.vz * smp.nz;
  assert.ok(newNormVel < 0, `Expected inward bounce velocity, got ${newNormVel}`);

  // Reset helper restores centerline
  const car = createInitialCarState(0);
  car.x = farRightX;
  car.z = farRightZ;
  car.speed = 20;
  resetCarToNearestTrack(car);
  const closest = findClosestTrackSample(car.x, car.z);
  assert.ok(Math.abs(closest.lateralOffset) < 0.01);
  assert.equal(car.speed, 0);
});

test('checkpoint system validates sequential full laps and rejects start-line oscillation', () => {
  const race = createInitialRaceState(0);

  // Oscillating back and forth across start line without hitting checkpoints 1..3
  stepRaceRules(race, TRACK_LENGTH - 3, 1, 20, 0.016);
  const cheatEvt = stepRaceRules(race, 3, 1, 20, 0.016);
  assert.equal(cheatEvt.lapCompleted, null);
  assert.equal(race.currentLap, 1);

  // Drive cleanly through 3 laps hitting checkpoints 1, 2, 3 in order
  for (let lap = 1; lap <= TOTAL_LAPS; lap++) {
    const s1 = TRACK_LENGTH * 0.25 + 2;
    const s2 = TRACK_LENGTH * 0.5 + 2;
    const s3 = TRACK_LENGTH * 0.75 + 2;

    // Step smoothly in increments so crossings are detected
    stepRaceRules(race, TRACK_LENGTH * 0.2, 1, 30, 1.5);
    const cp1 = stepRaceRules(race, s1, 1, 30, 1.5);
    assert.equal(cp1.checkpointReached, 1);

    stepRaceRules(race, TRACK_LENGTH * 0.45, 1, 30, 1.5);
    const cp2 = stepRaceRules(race, s2, 1, 30, 1.5);
    assert.equal(cp2.checkpointReached, 2);

    stepRaceRules(race, TRACK_LENGTH * 0.7, 1, 30, 1.5);
    const cp3 = stepRaceRules(race, s3, 1, 30, 1.5);
    assert.equal(cp3.checkpointReached, 3);

    stepRaceRules(race, TRACK_LENGTH * 0.95, 1, 30, 1.5);
    const fin = stepRaceRules(race, 4, 1, 30, 1.5);
    assert.equal(fin.lapCompleted, lap);
  }

  assert.equal(race.finished, true);
  assert.equal(race.lapTimes.length, TOTAL_LAPS);
  assert.ok(race.bestLapTime !== null && race.bestLapTime > 0);
  assert.equal(formatRaceTime(65.43), '01:05.43');
});
