import React from 'react';
import { Segmented } from '../ui/controls';
import { Programme } from './Programme';
import { Progress } from './Progress';
import { Nutrition } from './Nutrition';

export type SportView = 'programme' | 'progress' | 'food';

/** Everything from Fonte: the program, progress and food, one tap apart. */
export function Sport({ view, onView, onSession, onEntry }: { view: SportView; onView(v: SportView): void; onSession(): void; onEntry(): void }) {
  return (
    <>
      <div className="sport-seg">
        <Segmented<SportView>
          label="Sport"
          value={view}
          onPick={onView}
          options={[
            { value: 'programme', label: 'Programme' },
            { value: 'progress', label: 'Progrès' },
            { value: 'food', label: 'Repas' },
          ]}
        />
      </div>
      {view === 'programme' ? <Programme onSession={onSession} /> : null}
      {view === 'progress' ? <Progress /> : null}
      {view === 'food' ? <Nutrition onEntry={onEntry} /> : null}
    </>
  );
}
