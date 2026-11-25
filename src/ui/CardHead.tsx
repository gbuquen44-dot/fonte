import React from 'react';
import type { Project } from '../core/head';

/** Colour family of a card, borrowed from the projects: red, blue, green, amber. */
export type Tone = Project;

/** A card title with its glyph in a tinted square, and room on the right for an action. */
export function CardHead({ glyph: Glyph, tone, title, children }: { glyph: (p: { size?: number }) => React.ReactElement; tone: Tone; title: string; children?: React.ReactNode }) {
  return (
    <div className="card-title">
      <span className={`tile-ic pc-${tone}`}>
        <Glyph size={17} />
      </span>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
