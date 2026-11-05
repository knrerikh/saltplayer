import React from 'react';
import { icons, iconViewBox, type IconName } from '@/shared/icons';

/** A shared monochrome icon, drawn in the current text colour. */
export default function Icon({ name, size }: { name: IconName; size: number }) {
  return (
    <svg viewBox={iconViewBox} width={size} height={size} fill="currentColor" aria-hidden="true">
      {icons[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
