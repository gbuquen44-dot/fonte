import React from 'react';
import { useApp } from '../state/store';
import { fr1 } from '../ui/controls';
import { IconBack, IconChart, IconChevron, IconCoach, IconFood, IconGear } from '../ui/icons';
import { weighIns } from '../core/energy';
import { Nutrition } from './Nutrition';
import { Progress } from './Progress';
import { Coach } from './Coach';

export type MeView = 'food' | 'progress' | 'coach' | null;

const ITEMS: { id: Exclude<MeView, null>; label: string; sub: string; Icon: (p: { size?: number }) => React.ReactElement }[] = [
  { id: 'progress', label: 'Progrès', sub: 'Force, poids, séries par muscle', Icon: IconChart },
  { id: 'food', label: 'Nutrition', sub: 'Calories, protéines, ton plan', Icon: IconFood },
  { id: 'coach', label: 'Coach', sub: 'Tes tendances, une question', Icon: IconCoach },
];

/** Everything that is not today's session or the program, one tap away. */
export function Me({ view, onView, onSettings, onEntry }: { view: MeView; onView(v: MeView): void; onSettings(): void; onEntry(): void }) {
  const days = useApp((r) => r.data.days);
  const last = weighIns(days).pop();

  if (view) {
    return (
      <>
        <button type="button" className="me-back" onClick={() => onView(null)}>
          <IconBack size={18} /> Moi
        </button>
        {view === 'food' ? <Nutrition onEntry={onEntry} /> : null}
        {view === 'progress' ? <Progress /> : null}
        {view === 'coach' ? <Coach /> : null}
      </>
    );
  }

  return (
    <div className="screen">
      <header className="head">
        <div>
          <p>{last ? `${fr1(last.weight)} kg à la dernière pesée` : 'Ton suivi'}</p>
          <h1>Moi</h1>
        </div>
      </header>
      <ul className="me-list card">
        {ITEMS.map(({ id, label, sub, Icon }) => (
          <li key={id}>
            <button type="button" onClick={() => onView(id)}>
              <span className="me-icon">
                <Icon size={22} />
              </span>
              <span className="me-text">
                <strong>{label}</strong>
                <small>{sub}</small>
              </span>
              <IconChevron size={18} />
            </button>
          </li>
        ))}
        <li>
          <button type="button" onClick={onSettings}>
            <span className="me-icon">
              <IconGear size={22} />
            </span>
            <span className="me-text">
              <strong>Réglages</strong>
              <small>Sauvegarde, début du programme</small>
            </span>
            <IconChevron size={18} />
          </button>
        </li>
      </ul>
    </div>
  );
}
