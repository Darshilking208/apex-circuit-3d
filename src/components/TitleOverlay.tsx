import React from 'react';

interface TitleOverlayProps {
  onStart: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({ onStart }) => {
  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between p-6 sm:p-10 pointer-events-none select-none"
      aria-label="Title screen"
    >
      {/* Top-Left / Calm Sky Negative-Space Lockup */}
      <div className="max-w-lg pt-2 sm:pt-4 pointer-events-auto">
        <svg
          viewBox="0 0 460 132"
          className="w-72 sm:w-[420px] h-auto drop-shadow-[0_4px_14px_rgba(12,18,28,0.45)]"
          role="img"
          aria-label="Apex Circuit"
        >
          {/* Motorsport Checkered Crest Shield */}
          <path
            d="M12 20 L68 20 L58 76 L34 94 L10 76 Z"
            fill="#141821"
            stroke="#f4f5f7"
            strokeWidth="3"
          />
          <rect x="20" y="28" width="10" height="10" fill="#e03131" />
          <rect x="30" y="28" width="10" height="10" fill="#f4f5f7" />
          <rect x="40" y="28" width="10" height="10" fill="#e03131" />
          <rect x="20" y="38" width="10" height="10" fill="#f4f5f7" />
          <rect x="30" y="38" width="10" height="10" fill="#e03131" />
          <rect x="40" y="38" width="10" height="10" fill="#f4f5f7" />
          <path d="M22 56 L48 56 L35 76 Z" fill="#f59f00" />

          {/* Bold Italicized Wordmark */}
          <text
            x="84"
            y="62"
            fill="#ffffff"
            stroke="#141821"
            strokeWidth="6"
            paintOrder="stroke fill"
            fontFamily="system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
            fontWeight="900"
            fontStyle="italic"
            fontSize="54"
            letterSpacing="2"
          >
            APEX
          </text>
          <text
            x="84"
            y="108"
            fill="#f59f00"
            stroke="#141821"
            strokeWidth="5"
            paintOrder="stroke fill"
            fontFamily="system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
            fontWeight="900"
            fontStyle="italic"
            fontSize="36"
            letterSpacing="5"
          >
            CIRCUIT
          </text>
          {/* Racing Stripe Accent */}
          <rect x="84" y="118" width="142" height="5" fill="#e03131" />
          <rect x="232" y="118" width="44" height="5" fill="#ffffff" />
        </svg>

        <div className="mt-6 flex items-center gap-4">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="px-7 py-3.5 bg-[#d92626] hover:bg-[#eb3434] active:translate-y-0.5 text-white font-black italic tracking-wider text-lg uppercase border-2 border-white/90 shadow-[0_6px_0_#7f1313,0_12px_24px_rgba(15,20,30,0.45)] transition-transform cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#f59f00]"
          >
            Start Race
          </button>
        </div>
      </div>

      {/* Single Flat Borderless Control Hint Line in Bottom Safe Margin */}
      <div className="w-full text-center pb-1">
        <p className="inline-block px-3 py-1 bg-[#141821]/80 text-[#f1f3f5] text-xs sm:text-sm font-semibold tracking-wide">
          W / ↑ Accelerate · S / ↓ Brake / Reverse · A D / ← → Steer · Space Handbrake · R Reset · Esc Pause
        </p>
      </div>
    </div>
  );
};
