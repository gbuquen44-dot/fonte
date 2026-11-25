import React from 'react';
import type { Project } from '../core/head';

/**
 * Lock-in's own icons: drawn by hand on a 24 grid, in two tones of the same
 * colour (a soft filled body, one crisp detail on top). They take the colour of
 * the text around them, so one glyph works red, green, grey or white.
 */

type P = { size?: number };

const SOFT = 0.32;

const G = ({ size = 24, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="glyph">
    {children}
  </svg>
);

const line = { stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const GlyphLock = (p: P) => (
  <G {...p}>
    <path d="M8 10.5V8.2a4 4 0 0 1 8 0v2.3" {...line} strokeWidth="2.3" />
    <rect x="4.5" y="10" width="15" height="11" rx="3.6" fill="currentColor" opacity={SOFT} />
    <circle cx="12" cy="14.6" r="1.7" fill="currentColor" />
    <rect x="11.15" y="15.2" width="1.7" height="3.2" rx="0.85" fill="currentColor" />
  </G>
);

export const GlyphScale = (p: P) => (
  <G {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5.5" fill="currentColor" opacity={SOFT} />
    <path d="M7.4 11.2a4.6 4.6 0 0 1 9.2 0" {...line} strokeWidth="2" />
    <path d="M12 11.2l2.3-2.6" {...line} strokeWidth="2.1" />
    <circle cx="12" cy="16.2" r="1.3" fill="currentColor" />
  </G>
);

export const GlyphTodo = (p: P) => (
  <G {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5.5" fill="currentColor" opacity={SOFT} />
    <path d="M8 12.4l2.8 2.8L16.3 9" {...line} strokeWidth="2.5" />
  </G>
);

export const GlyphMoon = (p: P) => (
  <G {...p}>
    <path d="M19.6 14.7A8.1 8.1 0 1 1 9.3 4.4a6.5 6.5 0 0 0 10.3 10.3z" fill="currentColor" opacity={SOFT} />
    <path d="M19.6 14.7A8.1 8.1 0 1 1 9.3 4.4" {...line} strokeWidth="1.8" />
    <path d="M16.8 3.4l.75 1.75 1.75.75-1.75.75-.75 1.75-.75-1.75-1.75-.75 1.75-.75z" fill="currentColor" />
  </G>
);

export const GlyphBowl = (p: P) => (
  <G {...p}>
    <path d="M3.6 11.6h16.8a8.4 8.4 0 0 1-16.8 0z" fill="currentColor" opacity={SOFT} />
    <path d="M2.8 11.6h18.4" {...line} strokeWidth="2.1" />
    <path d="M9.6 4.2c-1.1 1.2 1.1 2.1 0 3.4M14.4 4.2c-1.1 1.2 1.1 2.1 0 3.4" {...line} strokeWidth="1.8" />
  </G>
);

export const GlyphDumbbell = (p: P) => (
  <G {...p}>
    <rect x="7" y="10.9" width="10" height="2.2" rx="1.1" fill="currentColor" />
    <rect x="1.8" y="9.2" width="2.4" height="5.6" rx="1.2" fill="currentColor" opacity={SOFT} />
    <rect x="19.8" y="9.2" width="2.4" height="5.6" rx="1.2" fill="currentColor" opacity={SOFT} />
    <rect x="4.4" y="6.2" width="3.5" height="11.6" rx="1.6" fill="currentColor" />
    <rect x="16.1" y="6.2" width="3.5" height="11.6" rx="1.6" fill="currentColor" />
  </G>
);

export const GlyphBiz = (p: P) => (
  <G {...p}>
    <rect x="3.5" y="13" width="4.4" height="7.5" rx="1.6" fill="currentColor" opacity={SOFT} />
    <rect x="9.8" y="9" width="4.4" height="11.5" rx="1.6" fill="currentColor" opacity={SOFT} />
    <rect x="16.1" y="4" width="4.4" height="16.5" rx="1.6" fill="currentColor" />
  </G>
);

export const GlyphSchool = (p: P) => (
  <G {...p}>
    <path d="M6.4 11.4v4.5c3.3 2.7 7.9 2.7 11.2 0v-4.5L12 14.2z" fill="currentColor" opacity={SOFT} />
    <path d="M12 4.2 2.6 9 12 13.8 21.4 9z" fill="currentColor" />
    <path d="M20.2 9.8v5" {...line} strokeWidth="1.8" />
  </G>
);

export const GlyphPerso = (p: P) => (
  <G {...p}>
    <path d="M4.4 20.6c.6-4.3 3.6-6.8 7.6-6.8s7 2.5 7.6 6.8z" fill="currentColor" opacity={SOFT} />
    <circle cx="12" cy="8" r="3.9" fill="currentColor" />
  </G>
);

export const GlyphTiles = (p: P) => (
  <G {...p}>
    <rect x="3.2" y="3.2" width="7.8" height="7.8" rx="2.6" fill="currentColor" />
    <rect x="13" y="3.2" width="7.8" height="7.8" rx="2.6" fill="currentColor" opacity={SOFT} />
    <rect x="3.2" y="13" width="7.8" height="7.8" rx="2.6" fill="currentColor" opacity={SOFT} />
    <rect x="13" y="13" width="7.8" height="7.8" rx="2.6" fill="currentColor" opacity={SOFT} />
  </G>
);

export const GlyphBulb = (p: P) => (
  <G {...p}>
    <path d="M12 2.8a6.6 6.6 0 0 0-3.9 11.9v2.2h7.8v-2.2A6.6 6.6 0 0 0 12 2.8z" fill="currentColor" opacity={SOFT} />
    <rect x="8.9" y="18.4" width="6.2" height="2.7" rx="1.35" fill="currentColor" />
    <path d="M10.2 12.6 12 9.6l1.8 3" {...line} strokeWidth="1.8" />
  </G>
);

export const GlyphHeart = (p: P) => (
  <G {...p}>
    <path d="M12 20.4s-8.2-4.7-8.2-10.6A4.5 4.5 0 0 1 12 7.2a4.5 4.5 0 0 1 8.2 2.6c0 5.9-8.2 10.6-8.2 10.6z" fill="currentColor" opacity={SOFT} />
    <path d="M4.6 12.6h3.3l1.7-3.1 2.7 5.6 1.7-2.5h5.4" {...line} strokeWidth="1.9" />
  </G>
);

export const GlyphMic = (p: P) => (
  <G {...p}>
    <rect x="8.6" y="2.6" width="6.8" height="11.6" rx="3.4" fill="currentColor" />
    <path d="M5.4 11.2a6.6 6.6 0 0 0 13.2 0M12 17.8v3.4" {...line} strokeWidth="2" />
  </G>
);

export const GlyphSliders = (p: P) => (
  <G {...p}>
    <path d="M4 8h16M4 16h16" {...line} strokeWidth="2" opacity={0.45} />
    <circle cx="9" cy="8" r="2.7" fill="currentColor" />
    <circle cx="15" cy="16" r="2.7" fill="currentColor" />
  </G>
);

export const GlyphPlay = (p: P) => (
  <G {...p}>
    <path d="M8 5.7c0-1 1.1-1.6 2-1.1l9.1 5.9c.8.5.8 1.7 0 2.2L10 18.5c-.9.5-2-.1-2-1.1z" fill="currentColor" />
  </G>
);

export const GlyphStop = (p: P) => (
  <G {...p}>
    <rect x="6" y="6" width="12" height="12" rx="3.2" fill="currentColor" />
  </G>
);

export const PROJECT_GLYPH: Record<Project, (p: P) => React.ReactElement> = {
  biz: GlyphBiz,
  ecole: GlyphSchool,
  salle: GlyphDumbbell,
  perso: GlyphPerso,
};
