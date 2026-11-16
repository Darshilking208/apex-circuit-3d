import { TRACK_LENGTH } from './track';

export const TOTAL_LAPS = 3;
export const NUM_CHECKPOINTS = 3; // 25%, 50%, 75% around track before Start/Finish (0%)

export interface RaceProgressState {
  currentLap: number;          // 1..TOTAL_LAPS
  totalLaps: number;
  highestCheckpoint: number;   // 0..NUM_CHECKPOINTS reached in order on current lap
  lastS: number;
  currentLapTime: number;
  totalTime: number;
  bestLapTime: number | null;
  lapTimes: number[];
  finished: boolean;
  wrongWay: boolean;
  bannerText: string | null;
  bannerTimer: number;
}

export interface RaceStepEvents {
  checkpointReached: number | null; // 1, 2, or 3
  lapCompleted: number | null;      // completed lap number (1..TOTAL_LAPS)
  raceFinished: boolean;
}

export function createInitialRaceState(startS = 0): RaceProgressState {
  return {
    currentLap: 1,
    totalLaps: TOTAL_LAPS,
    highestCheckpoint: 0,
    lastS: startS,
    currentLapTime: 0,
    totalTime: 0,
    bestLapTime: null,
    lapTimes: [],
    finished: false,
    wrongWay: false,
    bannerText: null,
    bannerTimer: 0,
  };
}

/**
 * Checks whether s crossed targetS in the forward direction along the closed loop.
 */
function crossedForward(prevS: number, currS: number, targetS: number): boolean {
  const half = TRACK_LENGTH * 0.5;
  let delta = currS - prevS;
  if (delta < -half) delta += TRACK_LENGTH;
  if (delta > half) delta -= TRACK_LENGTH;
  if (delta <= 0) return false;

  if (targetS === 0) {
    // Crossing start/finish line forward: prevS near end of loop, currS near start
    return prevS > TRACK_LENGTH * 0.7 && currS < TRACK_LENGTH * 0.3;
  }

  return prevS < targetS && currS >= targetS;
}

export function stepRaceRules(
  state: RaceProgressState,
  currentS: number,
  forwardDotTrack: number,
  speed: number,
  dt: number
): RaceStepEvents {
  const events: RaceStepEvents = {
    checkpointReached: null,
    lapCompleted: null,
    raceFinished: false,
  };

  if (state.bannerTimer > 0) {
    state.bannerTimer = Math.max(0, state.bannerTimer - dt);
    if (state.bannerTimer === 0) {
      state.bannerText = null;
    }
  }

  if (state.finished) {
    return events;
  }

  state.currentLapTime += dt;
  state.totalTime += dt;

  // Wrong-way detection when driving significantly backwards along track
  state.wrongWay = speed > 3.5 && forwardDotTrack < -0.45;

  // Check sequential checkpoints (25%, 50%, 75%)
  const nextCheckpoint = state.highestCheckpoint + 1;
  if (nextCheckpoint <= NUM_CHECKPOINTS) {
    const cpS = (nextCheckpoint / (NUM_CHECKPOINTS + 1)) * TRACK_LENGTH;
    if (crossedForward(state.lastS, currentS, cpS)) {
      state.highestCheckpoint = nextCheckpoint;
      events.checkpointReached = nextCheckpoint;
      state.bannerText = `SECTOR ${nextCheckpoint} / ${NUM_CHECKPOINTS}`;
      state.bannerTimer = 1.6;
    }
  }

  // Validate Start/Finish crossing only when all checkpoints have been cleared
  if (
    state.highestCheckpoint === NUM_CHECKPOINTS &&
    crossedForward(state.lastS, currentS, 0)
  ) {
    const completedLap = state.currentLap;
    const lapTime = state.currentLapTime;
    state.lapTimes.push(lapTime);
    if (state.bestLapTime === null || lapTime < state.bestLapTime) {
      state.bestLapTime = lapTime;
    }
    events.lapCompleted = completedLap;

    if (completedLap >= state.totalLaps) {
      state.finished = true;
      events.raceFinished = true;
      state.bannerText = 'FINISH!';
      state.bannerTimer = 3.0;
    } else {
      state.currentLap = completedLap + 1;
      state.currentLapTime = 0;
      state.highestCheckpoint = 0;
      state.bannerText =
        state.currentLap === state.totalLaps
          ? 'FINAL LAP!'
          : `LAP ${state.currentLap}`;
      state.bannerTimer = 2.2;
    }
  }

  state.lastS = currentS;
  return events;
}

export function formatRaceTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) {
    return '--:--.--';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.floor((seconds * 100) % 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(
    2,
    '0'
  )}.${String(hundredths).padStart(2, '0')}`;
}
