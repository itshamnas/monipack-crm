import React from 'react';

/**
 * BrandWordmark Component
 * Renders the authentic "monipack" wordmark in Nadianne Bold font.
 * Replaces any occurrence of "[Mm]onipack" in text with the authentic brand styling,
 * while keeping surrounding text and punctuation intact.
 */
export default function BrandWordmark({ children, className = '', lowercase = true }) {
  if (!children) {
    return (
      <span className={`font-monipack ${lowercase ? 'lowercase' : ''} ${className}`}>
        monipack
      </span>
    );
  }

  if (typeof children !== 'string') {
    return <span className={className}>{children}</span>;
  }

  const parts = children.split(/([Mm]onipack)/g);
  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (/^[Mm]onipack$/i.test(part)) {
          return (
            <span key={index} className="font-monipack lowercase tracking-normal">
              monipack
            </span>
          );
        }
        return part;
      })}
    </span>
  );
}
