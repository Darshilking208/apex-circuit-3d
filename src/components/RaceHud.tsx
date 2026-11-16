import React, { useMemo } from 'react';
import { HudSnapshot } from '../game/RacingEngine';
import { formatRaceTime, NUM_CHECKPOINTS } from '../game/raceRules';
import { getMinimapTrackPoints } from '../game/track';

interface RaceHudProps {
  hud: HudSnapshot;
  onToggleMute: () => void;
  onResetCar: () => void;
  onPause: () => void;
}

export const RaceHud: React.FC<RaceHudProps> = ({
  hud,
  onToggleMute,
  onResetCar,
  onPause,
}) => {
  const minimap = useMemo(() => getMinimapTrackPoints(), []);

  const minimapPath = useMemo(() => {
    if (minimap.points.length === 0) return '';
    return (
      minimap.points
        .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${(p.x * 100).toFixed(1)} ${(p.z * 100).toFixed(1)}`)
        .join(' ') + ' Z'
    );
  }, [minimap]);

  const spanX = minimap.bounds.maxX - minimap.bounds.minX || 1;
  const spanZ = minimap.bounds.maxZ - minimap.bounds.minZ || 1;
  const carMapX = ((hud.carX - minimap.bounds.minX) / spanX) * 100;
  const carMapY = ((hud.carZ - minimap.bounds.minZ) / spanZ) * 100;
  const carDeg = (-hud.carHeading * 180) / Math.PI;

  const startDotX = ((0 - minimap.bounds.minX) / spanX) * 100;
  const startDotY = ((0 - minimap.bounds.minZ) / spanZ) * 100;

  // SVG Arc Speedometer Math (220° sweep from -200° to +20°)
  const arcRadius = 46;
  const arcCircumference = Math.PI * 2 * arcRadius;
  const sweepFraction = 220 / 360;
  const maxDash = arcCircumference * sweepFraction;
  const speedFrac = Math.min(1, hud.speedKmh / 200);
  const activeDash = maxDash * speedFrac;

  return (
    <div
      className="fixed inset-0 z-10 pointer-events-none select-none flex flex-col justify-between p-4 sm:p-6"
      aria-label="Race HUD"
    >
      {/* Top Row: Left Lap/Timer Telemetry & Right Utility Buttons */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left Timing Cluster */}
        <div className="bg-[#141821]/90 border-l-4 border-[#e03131] px-4 py-2.5 shadow-[0_6px_18px_rgba(10,14,22,0.35)] text-white">
          <div className="flex items-baseline gap-5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#adb5bd]">
                Lap
              </div>
              <div
                data-testid="hud-lap"
                className="text-2xl sm:text-3xl font-black italic tabular-nums leading-none mt-0.5"
              >
                {hud.currentLap}
                <span className="text-base text-[#868e96] font-bold not-italic ml-1">
                  /{hud.totalLaps}
                </span>
              </div>
            </div>

            <div className="border-l border-white/15 pl-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#adb5bd]">
                Lap Time
              </div>
              <div
                data-testid="hud-lap-time"
                className="text-2xl sm:text-3xl font-black tabular-nums leading-none mt-0.5 text-[#f8f9fa]"
              >
                {formatRaceTime(hud.currentLapTime)}
              </div>
            </div>

            <div className="hidden sm:block border-l border-white/15 pl-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#adb5bd]">
                Best
              </div>
              <div className="text-lg font-bold tabular-nums leading-none mt-1 text-[#f59f00]">
                {formatRaceTime(hud.bestLapTime)}
              </div>
            </div>
          </div>

          {/* Sector Checkpoint Pips */}
          <div className="mt-2 flex items-center gap-1.5" aria-label="Sector checkpoints">
            {Array.from({ length: NUM_CHECKPOINTS }).map((_, idx) => {
              const cleared = hud.highestCheckpoint >= idx + 1;
              return (
                <div
                  key={idx}
                  className={`h-1.5 flex-1 transition-colors ${
                    cleared ? 'bg-[#38d9a9]' : 'bg-white/20'
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* Top-Right Compact Utility Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={hud.muted ? 'Unmute audio (M)' : 'Mute audio (M)'}
            title="Mute / Unmute (M)"
            className="w-10 h-10 bg-[#141821]/90 hover:bg-[#1f2533] border border-white/25 text-white flex items-center justify-center cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" fillOpacity="0.2" />
              {hud.muted ? (
                <path d="M22 9l-6 6M16 9l6 6" stroke="#ff6b6b" />
              ) : (
                <path d="M15.5 8.5a5 5 0 010 7M19 5a9 9 0 010 14" stroke="#38d9a9" />
              )}
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onResetCar();
            }}
            aria-label="Reset car to track (R)"
            title="Reset Car (R)"
            className="w-10 h-10 bg-[#141821]/90 hover:bg-[#1f2533] border border-white/25 text-white flex items-center justify-center cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Pause race (Esc)"
            title="Pause (Esc)"
            className="w-10 h-10 bg-[#141821]/90 hover:bg-[#1f2533] border border-white/25 text-white flex items-center justify-center cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Transient Sector / Wrong-Way Center-Top Alert */}
      <div className="flex flex-col items-center justify-center pointer-events-none">
        {hud.wrongWay ? (
          <div className="bg-[#c92a2a] border-2 border-white px-5 py-2 text-white font-black italic tracking-widest text-xl uppercase shadow-lg">
            Wrong Way
          </div>
        ) : hud.bannerText ? (
          <div className="bg-[#141821]/92 border-b-4 border-[#f59f00] px-6 py-2 text-white font-black italic tracking-widest text-xl uppercase shadow-lg">
            {hud.bannerText}
          </div>
        ) : null}
      </div>

      {/* Bottom Row: Left Minimap & Right Speedometer Gauge */}
      <div className="flex items-end justify-between gap-4">
        {/* Bottom-Left Track Minimap */}
        <div className="bg-[#141821]/88 border border-white/20 p-2.5 shadow-[0_6px_18px_rgba(10,14,22,0.35)]">
          <svg
            viewBox="0 0 100 100"
            className="w-24 h-24 sm:w-28 sm:h-28 overflow-visible"
            aria-label="Track minimap"
          >
            <path
              d={minimapPath}
              fill="none"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="7"
              strokeLinejoin="round"
            />
            <path
              d={minimapPath}
              fill="none"
              stroke="#dee2e6"
              strokeWidth="2.8"
              strokeLinejoin="round"
            />
            {/* Start/Finish Marker */}
            <circle cx={startDotX} cy={startDotY} r="3.2" fill="#f59f00" />
            {/* Player Position Arrow */}
            <g transform={`translate(${carMapX.toFixed(1)}, ${carMapY.toFixed(1)}) rotate(${carDeg.toFixed(1)})`}>
              <polygon
                points="0,-5.5 4.2,4.5 0,2.5 -4.2,4.5"
                fill="#ff3b3b"
                stroke="#ffffff"
                strokeWidth="1.1"
              />
            </g>
          </svg>
        </div>

        {/* Bottom-Right Motorsport Speedometer & Gear Cluster */}
        <div className="bg-[#141821]/92 border-r-4 border-[#f59f00] px-4 py-2.5 shadow-[0_6px_18px_rgba(10,14,22,0.4)] flex items-center gap-4">
          <div className="relative w-28 h-24 flex items-center justify-center">
            <svg viewBox="0 0 120 106" className="w-full h-full">
              {/* Background Arc */}
              <circle
                cx="60"
                cy="60"
                r={arcRadius}
                fill="none"
                stroke="rgba(255,255,255,0.14)"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={`${maxDash} ${arcCircumference}`}
                transform="rotate(160 60 60)"
              />
              {/* Active Speed Arc */}
              <circle
                cx="60"
                cy="60"
                r={arcRadius}
                fill="none"
                stroke={hud.speedKmh > 165 ? '#e03131' : '#f59f00'}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={`${activeDash} ${arcCircumference}`}
                transform="rotate(160 60 60)"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
              <span
                data-testid="hud-speed"
                className="text-3xl font-black italic tabular-nums text-white leading-none"
              >
                {hud.speedKmh}
              </span>
              <span className="text-[10px] font-bold tracking-widest text-[#adb5bd] uppercase mt-0.5">
                KM/H
              </span>
            </div>
          </div>

          <div className="border-l border-white/15 pl-3 flex flex-col items-center">
            <span className="text-[10px] font-bold tracking-widest text-[#adb5bd] uppercase">
              Gear
            </span>
            <span
              data-testid="hud-gear"
              className="text-2xl font-black italic tabular-nums text-[#38d9a9] leading-tight"
            >
              {hud.gear}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
