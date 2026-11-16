import { useCallback, useEffect, useRef, useState } from 'react';
import { GameModal } from './components/GameModal';
import { RaceHud } from './components/RaceHud';
import { TitleOverlay } from './components/TitleOverlay';
import {
  GameScreenState,
  HudSnapshot,
  RacingEngine,
} from './game/RacingEngine';
import { TOTAL_LAPS } from './game/raceRules';

const INITIAL_HUD: HudSnapshot = {
  speedKmh: 0,
  gear: '1',
  rpmRatio: 0.14,
  currentLap: 1,
  totalLaps: TOTAL_LAPS,
  currentLapTime: 0,
  bestLapTime: null,
  totalTime: 0,
  lapTimes: [],
  carX: 0,
  carZ: 0,
  carHeading: 0,
  wrongWay: false,
  bannerText: null,
  highestCheckpoint: 0,
  muted: false,
};

function getInitialScreenState(): GameScreenState {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      return 'playing';
    }
  }
  return 'title';
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RacingEngine | null>(null);

  const [screenState, setScreenState] = useState<GameScreenState>(
    getInitialScreenState
  );
  const screenStateRef = useRef<GameScreenState>(screenState);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);

  const updateScreenState = useCallback((next: GameScreenState) => {
    screenStateRef.current = next;
    document.body.dataset.state = next;
    setScreenState(next);
    engineRef.current?.setScreenState(next);
  }, []);

  const handleStart = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    engineRef.current?.restartRace();
    updateScreenState('playing');
  }, [updateScreenState]);

  const handleResume = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    updateScreenState('playing');
  }, [updateScreenState]);

  const handlePause = useCallback(() => {
    updateScreenState('paused');
  }, [updateScreenState]);

  const handleRestart = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    engineRef.current?.restartRace();
    updateScreenState('playing');
  }, [updateScreenState]);

  const handleTitle = useCallback(() => {
    engineRef.current?.restartRace();
    updateScreenState('title');
  }, [updateScreenState]);

  const handleResetCar = useCallback(() => {
    engineRef.current?.resetCarToTrack();
  }, []);

  const handleToggleMute = useCallback(() => {
    engineRef.current?.toggleMute();
  }, []);

  useEffect(() => {
    document.body.dataset.state = screenStateRef.current;
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new RacingEngine(
      container,
      {
        onHudUpdate: (snapshot) => {
          setHud(snapshot);
        },
        onRaceFinish: (snapshot) => {
          setHud(snapshot);
          screenStateRef.current = 'gameover';
          document.body.dataset.state = 'gameover';
          setScreenState('gameover');
          engine.setScreenState('gameover');
        },
        onStateShortcut: (action) => {
          if (action === 'startFromTitle' && screenStateRef.current === 'title') {
            engine.restartRace();
            screenStateRef.current = 'playing';
            document.body.dataset.state = 'playing';
            setScreenState('playing');
            engine.setScreenState('playing');
          } else if (action === 'togglePause') {
            if (screenStateRef.current === 'playing') {
              screenStateRef.current = 'paused';
              document.body.dataset.state = 'paused';
              setScreenState('paused');
              engine.setScreenState('paused');
            } else if (screenStateRef.current === 'paused') {
              screenStateRef.current = 'playing';
              document.body.dataset.state = 'playing';
              setScreenState('playing');
              engine.setScreenState('playing');
            }
          } else if (action === 'toggleMute') {
            engine.toggleMute();
          }
        },
      },
      screenStateRef.current
    );

    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#141821]">
      {/* Isolated WebGL Canvas Mount */}
      <div
        ref={mountRef}
        data-testid="racing-canvas"
        className="absolute inset-0 w-full h-full"
      />

      {/* State-Driven Game Shell Overlays */}
      {screenState === 'title' && <TitleOverlay onStart={handleStart} />}

      {screenState === 'playing' && (
        <RaceHud
          hud={hud}
          onToggleMute={handleToggleMute}
          onResetCar={handleResetCar}
          onPause={handlePause}
        />
      )}

      {(screenState === 'paused' || screenState === 'gameover') && (
        <GameModal
          mode={screenState}
          hud={hud}
          onResume={handleResume}
          onRestart={handleRestart}
          onTitle={handleTitle}
        />
      )}
    </main>
  );
}
