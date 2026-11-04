import React from 'react';

/**
 * monipack Reusable Brand Logo Component
 * - Desktop: max-height 40px (sm:h-10 sm:max-h-[40px])
 * - Mobile: max-height 32px (h-8 max-h-[32px])
 * - Preserves 1:1 aspect ratio (aspect-square object-contain)
 * - Clickable linking to homepage ("/")
 * - Transparent background (background <rect> omitted from SVG)
 */
export default function BrandLogo({ 
  className = '', 
  onClick,
  showLabel = false,
  sizeClass = '' 
}) {
  const handleClick = (e) => {
    if (onClick) {
      onClick(e);
    }
  };

  return (
    <a
      href="/"
      onClick={handleClick}
      className={`group inline-flex items-center gap-2.5 shrink-0 transition-transform active:scale-95 focus:outline-hidden ${className}`}
      aria-label="monipack Home"
      title="monipack CRM Home"
    >
      <img
        src="/assets/logo.png"
        alt="monipack"
        className={sizeClass || "h-8 w-8 max-h-[32px] max-w-[32px] sm:h-10 sm:w-10 sm:max-h-[40px] sm:max-w-[40px] aspect-square object-contain drop-shadow-xs transition-transform group-hover:scale-105"}
        loading="eager"
        onError={(e) => {
          e.target.src = '/assets/logo.svg';
        }}
      />
      {showLabel && (
        <span 
          className="font-monipack text-lg tracking-tight text-text-main hidden sm:inline leading-none"
          style={{ color: 'var(--color-text-main, #111827)' }}
        >
          monipack
        </span>
      )}
    </a>
  );
}
