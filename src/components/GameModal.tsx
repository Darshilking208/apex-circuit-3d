import React from 'react';
import { GameScreenState, HudSnapshot } from '../game/RacingEngine';
import { formatRaceTime } from '../game/raceRules';

interface GameModalProps {
  mode: Extract<GameScreenState, 'paused' | 'gameover'>;
  hud: HudSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onTitle: () => void;
}

export const GameModal: React.FC<GameModalProps> = ({
  mode,
  hud,
  onResume,
  onRestart,
  onTitle,
}) => {
  const isPaused = mode === 'paused';

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-[#0c111b]/65 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isPaused ? 'Race paused' : 'Race complete'}
    >
      <div className="w-full max-w-md bg-[#141821] border-t-4 border-[#e03131] border-x border-b border-white/15 p-6 sm:p-7 text-white shadow-[0_20px_50px_rgba(0,0,0,0.65)]">
        <div className="flex items-center justify-between border-b border-white/15 pb-3">
          <h2 className="text-2xl font-black italic uppercase tracking-wider">
            {isPaused ? 'Race Paused' : 'Checkered Flag'}
          </h2>
          <span className="text-xs font-bold uppercase tracking-widest text-[#f59f00]">
            {isPaused ? `Lap ${hud.currentLap}/${hud.totalLaps}` : `${hud.totalLaps} Laps Complete`}
          </span>
        </div>

        {/* Stat Tiles */}
        <div className="grid grid-cols-2 gap-3 my-5">
          <div className="bg-[#1c222e] border border-white/10 p-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#adb5bd]">
              {isPaused ? 'Current Lap' : 'Total Time'}
            </div>
            <div className="text-xl font-black tabular-nums mt-1 text-white">
              {formatRaceTime(isPaused ? hud.currentLapTime : hud.totalTime)}
            </div>
          </div>

          <div className="bg-[#1c222e] border border-white/10 p-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#adb5bd]">
              Best Lap
            </div>
            <div className="text-xl font-black tabular-nums mt-1 text-[#f59f00]">
              {formatRaceTime(hud.bestLapTime)}
            </div>
          </div>
        </div>

        {/* Lap Splits on Finish */}
        {!isPaused && hud.lapTimes.length > 0 && (
          <div className="mb-5 bg-[#1a1f2a] border border-white/10 px-3 py-2 space-y-1">
            {hud.lapTimes.map((lt, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs font-semibold tabular-nums"
              >
                <span className="text-[#adb5bd] uppercase tracking-wider">
                  Lap {idx + 1}
                </span>
                <span className={lt === hud.bestLapTime ? 'text-[#38d9a9] font-bold' : 'text-white'}>
                  {formatRaceTime(lt)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex flex-col gap-2.5">
          {isPaused ? (
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onResume();
              }}
              className="w-full py-3 bg-[#d92626] hover:bg-[#eb3434] text-white font-black italic uppercase tracking-wider text-base cursor-pointer"
            >
              Resume Race
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              className="w-full py-3 bg-[#d92626] hover:bg-[#eb3434] text-white font-black italic uppercase tracking-wider text-base cursor-pointer"
            >
              Race Again
            </button>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            {isPaused && (
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onRestart();
                }}
                className="py-2.5 bg-[#232a38] hover:bg-[#2d3648] border border-white/15 text-white font-bold uppercase tracking-wider text-xs cursor-pointer"
              >
                Restart
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onTitle();
              }}
              className={`py-2.5 bg-[#232a38] hover:bg-[#2d3648] border border-white/15 text-[#dee2e6] font-bold uppercase tracking-wider text-xs cursor-pointer ${
                !isPaused ? 'col-span-2' : ''
              }`}
            >
              Title Screen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
