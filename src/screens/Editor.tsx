import React, { useMemo, useRef, useState } from 'react';
import { updateProfile, useApp } from '../state/store';
import { DAY_LABEL, dayKey, shortDate, type ISODate } from '../core/dates';
import { buildSession, dayPlan, estimateMinutes, FAIL } from '../core/program';
import { linkedToNext, mainMuscle, moveSlot, normalizeGroups, pickable, registerCustom, setsOf, toggleSuperset } from '../core/edit';
import { plural, repsText } from '../core/labels';
import type { EquipKind, ExerciseDef, Muscle, SessionKey, Slot } from '../core/types';
import { EXERCISES, MUSCLE_LABEL } from '../data/exercises';
import { Choice, Segmented, Sheet } from '../ui/controls';
import { IconPlus } from '../ui/icons';

type Scope = 'all' | 'day';

const RANGES: { id: string; reps: number; repsMax: number; label: string }[] = [
  { id: '6-9', reps: 6, repsMax: 9, label: '6-9' },
  { id: '8-12', reps: 8, repsMax: 12, label: '8-12' },
  { id: '10-15', reps: 10, repsMax: 15, label: '10-15' },
];

const nameOf = (exId: string) => EXERCISES[exId]?.name ?? exId;

function slotSub(x: Slot) {
  const reps = x.max ? 'le max de reps' : `${repsText(x.reps, x.repsMax)} reps`;
  return `${reps}${x.rpe === FAIL ? ' · à l\'échec' : ''}`;
}

/** Edits one muscle-building day: every week, or this date only. */
export function DayEditor({ open, onClose, sessionKey, date }: { open: boolean; onClose(): void; sessionKey: SessionKey; date: ISODate }) {
  return (
    <Sheet open={open} onClose={onClose} label="Modifier la séance" full>
      {open ? <Body sessionKey={sessionKey} date={date} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Body({ sessionKey, date, onClose }: { sessionKey: SessionKey; date: ISODate; onClose(): void }) {
  const p = useApp((r) => r.data.profile!);
  const plan = dayPlan(sessionKey, p.muscu);
  const override = p.muscuDays?.[date];
  const [scope, setScope] = useState<Scope>(override ? 'day' : 'all');
  const [slots, setSlots] = useState<Slot[]>(() => structuredClone(override ?? plan.slots));
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const day = DAY_LABEL[dayKey(date)].toLowerCase();
  const minutes = useMemo(() => estimateMinutes(buildSession(0, 2, sessionKey, undefined, slots)), [slots, sessionKey]);

  const save = () => {
    if (scope === 'all') {
      const rest = { ...p.muscuDays };
      delete rest[date];
      updateProfile({ muscu: { ...p.muscu, [sessionKey]: { ...plan, slots } }, muscuDays: rest });
    } else {
      updateProfile({ muscuDays: { ...p.muscuDays, [date]: slots } });
    }
    onClose();
  };

  const backToPlan = () => {
    const rest = { ...p.muscuDays };
    delete rest[date];
    updateProfile({ muscuDays: rest });
    onClose();
  };

  const patch = (i: number, change: Partial<Slot>) => setSlots((list) => list.map((x, j) => (j === i ? { ...x, ...change } : x)));

  return (
    <div className="editor">
      <div className="ed-top">
        <button type="button" className="ed-link" onClick={onClose}>
          Annuler
        </button>
        <button type="button" className="btn primary small ed-done" onClick={save}>
          Terminé
        </button>
      </div>
      <h2 className="ed-title">Modifier « {plan.title} »</h2>
      <Segmented<Scope>
        label="Ce que tu changes"
        value={scope}
        onPick={setScope}
        options={[
          { value: 'all', label: `Tous les ${day}s` },
          { value: 'day', label: `Juste le ${shortDate(date)}` },
        ]}
      />
      <p className="ed-hint">Glisse avec la poignée pour changer l'ordre. Touche un exercice pour le régler ou le remplacer.</p>

      <SlotList slots={slots} onMove={(from, to) => setSlots((l) => moveSlot(l, from, to))} onOpen={setEditing} onSets={(i, n) => patch(i, { sets: Math.max(1, Math.min(8, n)) })} />

      <button type="button" className="ed-add" onClick={() => setAdding(true)}>
        <IconPlus size={18} /> Ajouter un exercice
      </button>
      <p className="ed-sum num">
        {setsOf(slots)} {plural(setsOf(slots), 'série')} · environ {minutes} min
      </p>
      {override && scope === 'day' ? (
        <button type="button" className="btn ghost small" onClick={backToPlan}>
          Revenir au programme habituel ce jour-là
        </button>
      ) : null}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} label="Régler l'exercice">
        {editing !== null && slots[editing] ? (
          <SlotSheet
            slot={slots[editing]}
            index={editing}
            count={slots.length}
            linked={linkedToNext(slots, editing)}
            onChange={(c) => patch(editing, c)}
            onSuperset={() => setSlots((l) => toggleSuperset(l, editing))}
            onMove={(d) => {
              setSlots((l) => moveSlot(l, editing, editing + d));
              setEditing(Math.max(0, Math.min(slots.length - 1, editing + d)));
            }}
            onRemove={() => {
              setSlots((l) => normalizeGroups(l.filter((_, j) => j !== editing)));
              setEditing(null);
            }}
            onClose={() => setEditing(null)}
          />
        ) : null}
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} label="Ajouter un exercice" full>
        {adding ? (
          <Picker
            title="Ajouter un exercice"
            onPick={(exId) => {
              setSlots((l) => [...l, { exId, sets: 3, reps: 6, repsMax: 9 }]);
              setAdding(false);
            }}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function SlotList({ slots, onMove, onOpen, onSets }: { slots: Slot[]; onMove(from: number, to: number): void; onOpen(i: number): void; onSets(i: number, n: number): void }) {
  const [drag, setDrag] = useState<{ i: number; dy: number } | null>(null);
  const start = useRef(0);
  const row = useRef(70);
  const target = drag ? Math.max(0, Math.min(slots.length - 1, drag.i + Math.round(drag.dy / row.current))) : -1;

  const shift = (j: number) => {
    if (!drag) return 0;
    if (j === drag.i) return drag.dy;
    if (drag.i < target && j > drag.i && j <= target) return -row.current;
    if (drag.i > target && j < drag.i && j >= target) return row.current;
    return 0;
  };

  return (
    <ol className="ed-list">
      {slots.map((x, i) => {
        const inGroup = !!x.group && (slots[i - 1]?.group === x.group || slots[i + 1]?.group === x.group);
        const first = inGroup && slots[i - 1]?.group !== x.group;
        return (
          <li key={`${x.exId}-${i}`} className={`ed-row${inGroup ? ' ss' : ''}${drag?.i === i ? ' lifted' : ''}`} style={{ transform: `translateY(${shift(i)}px)` }}>
            <span
              className="ed-grip"
              aria-label={`Déplacer ${nameOf(x.exId)}`}
              role="button"
              onPointerDown={(e) => {
                start.current = e.clientY;
                row.current = (e.currentTarget.parentElement?.offsetHeight ?? 62) + 8;
                e.currentTarget.setPointerCapture(e.pointerId);
                setDrag({ i, dy: 0 });
              }}
              onPointerMove={(e) => drag && setDrag({ i: drag.i, dy: e.clientY - start.current })}
              onPointerUp={() => {
                if (drag) onMove(drag.i, target);
                setDrag(null);
              }}
              onPointerCancel={() => setDrag(null)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="9" cy="6" r="1.6" />
                <circle cx="15" cy="6" r="1.6" />
                <circle cx="9" cy="12" r="1.6" />
                <circle cx="15" cy="12" r="1.6" />
                <circle cx="9" cy="18" r="1.6" />
                <circle cx="15" cy="18" r="1.6" />
              </svg>
            </span>
            <button type="button" className="ed-name" onClick={() => onOpen(i)}>
              <b>{nameOf(x.exId)}</b>
              <small className="num">
                {first ? 'Superset · ' : ''}
                {slotSub(x)}
              </small>
            </button>
            <span className="ed-step">
              <button type="button" aria-label="Une série de moins" onClick={() => onSets(i, x.sets - 1)}>
                −
              </button>
              <b className="num">{x.sets}</b>
              <button type="button" aria-label="Une série de plus" onClick={() => onSets(i, x.sets + 1)}>
                +
              </button>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function SlotSheet({
  slot,
  index,
  count,
  linked,
  onChange,
  onSuperset,
  onMove,
  onRemove,
  onClose,
}: {
  slot: Slot;
  index: number;
  count: number;
  linked: boolean;
  onChange(c: Partial<Slot>): void;
  onSuperset(): void;
  onMove(d: number): void;
  onRemove(): void;
  onClose(): void;
}) {
  const [swap, setSwap] = useState(false);
  if (swap) {
    return (
      <Picker
        title={`Remplacer ${nameOf(slot.exId)}`}
        near={slot.exId}
        onPick={(exId) => {
          onChange({ exId, note: undefined });
          setSwap(false);
        }}
        onBack={() => setSwap(false)}
      />
    );
  }
  const range = RANGES.find((r) => r.reps === slot.reps && r.repsMax === slot.repsMax);
  return (
    <div className="ed-sheet">
      <div className="sheet-head">
        <h2>{nameOf(slot.exId)}</h2>
        <button type="button" className="btn primary small ed-done" onClick={onClose}>
          OK
        </button>
      </div>

      <div className="ed-field">
        <span>Séries</span>
        <span className="ed-step">
          <button type="button" aria-label="Une série de moins" onClick={() => onChange({ sets: Math.max(1, slot.sets - 1) })}>
            −
          </button>
          <b className="num">{slot.sets}</b>
          <button type="button" aria-label="Une série de plus" onClick={() => onChange({ sets: Math.min(8, slot.sets + 1) })}>
            +
          </button>
        </span>
      </div>

      {slot.max ? null : (
        <div className="ed-field col">
          <span>Reps</span>
          <Segmented<string>
            label="Fourchette de reps"
            value={range?.id ?? 'autre'}
            onPick={(id) => {
              const r = RANGES.find((x) => x.id === id);
              if (r) onChange({ reps: r.reps, repsMax: r.repsMax });
            }}
            options={[...RANGES.map((r) => ({ value: r.id, label: r.label })), ...(range ? [] : [{ value: 'autre', label: repsText(slot.reps, slot.repsMax) }])]}
          />
        </div>
      )}

      <Toggle label="À l'échec" on={slot.rpe === FAIL} onFlip={() => onChange({ rpe: slot.rpe === FAIL ? undefined : FAIL })} />
      {index < count - 1 ? <Toggle label="En superset avec le suivant" on={linked} onFlip={onSuperset} /> : null}

      <label className="ed-field col">
        <span>Note pendant la série</span>
        <input type="text" value={slot.note ?? ''} placeholder="Prise serrée, main sur un banc…" onChange={(e) => onChange({ note: e.target.value || undefined })} />
      </label>

      <div className="ed-actions">
        <button type="button" className="btn ghost small" onClick={() => setSwap(true)}>
          Remplacer
        </button>
        <button type="button" className="btn ghost small" disabled={index === 0} onClick={() => onMove(-1)}>
          Monter
        </button>
        <button type="button" className="btn ghost small" disabled={index === count - 1} onClick={() => onMove(1)}>
          Descendre
        </button>
      </div>
      <button type="button" className="btn small ed-remove" onClick={onRemove}>
        Retirer de la séance
      </button>
    </div>
  );
}

function Toggle({ label, on, onFlip }: { label: string; on: boolean; onFlip(): void }) {
  return (
    <button type="button" className="ed-field ed-toggle" role="switch" aria-checked={on} onClick={onFlip}>
      <span>{label}</span>
      <i className={on ? 'on' : ''} aria-hidden="true" />
    </button>
  );
}

const MUSCLE_ORDER: Muscle[] = ['pecs', 'deltLat', 'deltAnt', 'deltPost', 'biceps', 'triceps', 'dos', 'quads', 'ischios', 'fessiers', 'abdos', 'erecteurs', 'traps'];

function Picker({ title, near, onPick, onBack }: { title: string; near?: string; onPick(exId: string): void; onBack?(): void }) {
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const all = pickable();
  const nearMuscle = near && EXERCISES[near] ? mainMuscle(EXERCISES[near]) : undefined;
  const needle = q.trim().toLowerCase();
  const found = all.filter((e) => e.id !== near && (!needle || e.name.toLowerCase().includes(needle)));
  const order = nearMuscle ? [nearMuscle, ...MUSCLE_ORDER.filter((m) => m !== nearMuscle)] : MUSCLE_ORDER;
  const groups = order.map((m) => ({ m, list: found.filter((e) => mainMuscle(e) === m).sort((a, b) => a.name.localeCompare(b.name, 'fr')) })).filter((g) => g.list.length);

  if (creating) return <Create initial={q} muscle={nearMuscle} onDone={onPick} onBack={() => setCreating(false)} />;

  return (
    <div className="ed-picker">
      <div className="sheet-head">
        <h2>{title}</h2>
        {onBack ? (
          <button type="button" className="ed-link" onClick={onBack}>
            Retour
          </button>
        ) : null}
      </div>
      <input type="search" value={q} placeholder="Chercher un exercice" aria-label="Chercher un exercice" onChange={(e) => setQ(e.target.value)} />
      {groups.map((g) => (
        <section key={g.m}>
          <h3>{MUSCLE_LABEL[g.m]}</h3>
          <ul>
            {g.list.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => onPick(e.id)}>
                  {e.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!groups.length ? <p className="ed-hint">Aucun exercice ne porte ce nom.</p> : null}
      <button type="button" className="ed-add" onClick={() => setCreating(true)}>
        <IconPlus size={18} /> Créer un exercice
      </button>
    </div>
  );
}

const KINDS: { value: EquipKind; label: string }[] = [
  { value: 'machine', label: 'Machine' },
  { value: 'cable', label: 'Poulie' },
  { value: 'dumbbell', label: 'Haltères' },
  { value: 'barbell', label: 'Barre' },
  { value: 'smith', label: 'Smith' },
  { value: 'bodyweight', label: 'Poids du corps' },
];

const STEP: Record<EquipKind, number> = { machine: 2.5, cable: 2.5, dumbbell: 1, barbell: 2.5, smith: 2.5, bodyweight: 2.5 };

function Create({ initial, muscle, onDone, onBack }: { initial: string; muscle?: Muscle; onDone(exId: string): void; onBack(): void }) {
  const p = useApp((r) => r.data.profile!);
  const [name, setName] = useState(initial);
  const [m, setM] = useState<Muscle | undefined>(muscle);
  const [kind, setKind] = useState<EquipKind>('machine');
  const [error, setError] = useState('');

  const create = () => {
    const clean = name.trim();
    if (!clean) return setError('Donne-lui un nom.');
    if (!m) return setError('Choisis le muscle travaillé.');
    const def: ExerciseDef = { id: `perso-${Date.now().toString(36)}`, name: clean, kind, muscles: { [m]: 1 }, step: STEP[kind], rest: 90 };
    const list = [...(p.customExercises ?? []), def];
    registerCustom(list);
    updateProfile({ customExercises: list });
    onDone(def.id);
  };

  return (
    <div className="ed-sheet">
      <div className="sheet-head">
        <h2>Nouvel exercice</h2>
        <button type="button" className="ed-link" onClick={onBack}>
          Retour
        </button>
      </div>
      <label className="ed-field col">
        <span>Nom</span>
        <input
          type="text"
          value={name}
          placeholder="Curl araignée"
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
        />
      </label>
      <div className="ed-field col">
        <span>Muscle travaillé</span>
        <Choice<Muscle>
          label="Muscle travaillé"
          columns={3}
          value={m}
          onPick={(v) => {
            setM(v);
            setError('');
          }}
          options={MUSCLE_ORDER.map((x) => ({ value: x, label: MUSCLE_LABEL[x] }))}
        />
      </div>
      <div className="ed-field col">
        <span>Matériel</span>
        <Choice<EquipKind> label="Matériel" columns={3} value={kind} onPick={setKind} options={KINDS} />
      </div>
      {error ? <p className="ed-error">{error}</p> : null}
      <button type="button" className="btn primary" onClick={create}>
        Créer et ajouter
      </button>
    </div>
  );
}
