import React, { useMemo, useState } from 'react';
import { updateDay, updateProfile, useApp } from '../state/store';
import { addDays, dayMonth, longDate, shortDate, type ISODate } from '../core/dates';
import { estimateMaintenance, ewma, gelEnd, macrosFor, mondayDecision, targetKcal, weighIns } from '../core/energy';
import type { DayLog } from '../core/types';
import { fr1, int, Keypad, kg, Ring, Segmented, Sheet, SheetHead } from '../ui/controls';
import { TimeChart } from '../ui/Chart';
import { useToday } from '../ui/hooks';

function Bar({ label, value, target, color }: { label: string; value?: number; target: number; color: string }) {
  return (
    <div className="macro">
      <span>{label}</span>
      <b className="num">
        {value !== undefined ? int(value) : '–'} <small>/ {target} g</small>
      </b>
      <i style={{ '--c': color } as React.CSSProperties}>
        <em style={{ transform: `scaleX(${value ? Math.min(1, value / target) : 0})` }} />
      </i>
    </div>
  );
}

export function Nutrition({ onEntry }: { onEntry(): void }) {
  const data = useApp((r) => r.data);
  const healthAt = useApp((r) => r.healthAt);
  const p = data.profile!;
  const today = useToday();
  const target = targetKcal(p.kcalPlan, today) ?? 0;
  const weights = useMemo(() => weighIns(data.days), [data.days]);
  const last = weights[weights.length - 1]?.weight ?? 68;
  const macros = macrosFor(target, last);
  const decision = useMemo(() => mondayDecision(p, data.days, today), [p, data.days, today]);
  const maintenance = useMemo(() => estimateMaintenance(p, data.days, today), [p, data.days, today]);
  const gel = gelEnd(p, today);
  const day = data.days[today];
  const trend = useMemo(() => ewma(weights).map((t) => ({ date: t.date, y: t.value })), [weights]);
  const raw = useMemo(() => weights.map((w) => ({ date: w.date, y: w.weight })), [weights]);
  const from = addDays(today, -60);
  const plan = [...p.kcalPlan].sort((a, b) => a.from.localeCompare(b.from));
  const left = day?.kcal !== undefined ? target - day.kcal : target;
  const nowStep = [...plan].reverse().find((s) => s.from <= today);

  const change = (delta: number) => {
    updateProfile({ kcalPlan: [...p.kcalPlan.filter((s) => s.from <= today), { from: addDays(today, 1), kcal: target + delta, reason: delta > 0 ? 'Hausse du lundi' : 'Baisse du lundi' }] });
  };

  return (
    <div className="screen">
      <header className="head">
        <div>
          <p>{longDate(today)}</p>
          <h1>Nutrition</h1>
        </div>
      </header>

      <section className="card fuel">
        <Ring value={day?.kcal ?? 0} max={target} size={132} width={13}>
          <b className="num big">{int(Math.abs(left))}</b>
          <small>{left >= 0 ? 'à manger' : 'en trop'}</small>
        </Ring>
        <div className="fuel-side">
          <p className="fuel-target">
            Objectif <b className="num">{int(target)} kcal</b>
          </p>
          <Bar label="Protéines" value={day?.protein} target={macros.protein} color="var(--sky)" />
          <Bar label="Glucides" value={day?.carbs} target={macros.carbs} color="var(--mint)" />
          <Bar label="Lipides" value={day?.fat} target={macros.fat} color="var(--amber)" />
        </div>
      </section>
      <button type="button" className="btn ghost" onClick={onEntry}>
        {day?.kcal !== undefined ? 'Corriger ma journée' : 'Noter ma journée à la main'}
      </button>
      <p className="source">
        {day?.healthAt ? `Reçu de Santé à ${new Date(day.healthAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.` : healthAt ? 'Pas encore de repas reçus de Santé aujourd\'hui.' : 'Santé n\'est pas encore branché. Tout se règle dans Réglages.'}
      </p>

      <section className="card">
        <h2>Ton plan de calories</h2>
        <ol className="steps">
          {plan.map((s) => {
            const state = s.from > today ? 'next' : s === nowStep ? 'now' : 'past';
            return (
              <li key={s.from} data-state={state}>
                <b className="num">{int(s.kcal)}</b>
                <span className="num">{shortDate(s.from)}</span>
              </li>
            );
          })}
        </ol>
        <p className="muted">{decision.kind === 'plan' ? `${decision.why} Si ton poids monte trop vite, on ralentit.` : decision.why}</p>
        {decision.kind === 'up' || decision.kind === 'down' ? (
          <button type="button" className="btn primary" onClick={() => change(decision.delta)}>
            {decision.delta > 0 ? 'Monter' : 'Baisser'} de {Math.abs(decision.delta)} kcal dès demain
          </button>
        ) : null}
        {p.kcalCapUntil ? <p className="muted">Plafond de {int(plan[plan.length - 1]?.kcal ?? target)} kcal jusqu'au {dayMonth(p.kcalCapUntil)}, puis on regarde ta courbe.</p> : null}
      </section>

      <section className="card">
        <h2>Avant la séance</h2>
        <p>{p.usualMeal?.label ?? 'Ton repas habituel'}, environ 1 h avant.</p>
        <p className="muted">C'est le bon repas : assez de glucides et facile à digérer. Garde le gras sous 30 g dans ce repas, il ralentit la digestion.</p>
      </section>

      <section className="card">
        <h2>Tes repères</h2>
        <ul className="plain">
          <li>
            <b>Protéines : {macros.protein} g.</b> Tu y es déjà, garde ce cap.
          </li>
          <li>
            <b>Lipides : {macros.fat} g.</b> Tes 40 à 50 g tiennent, mais c'est le bas de la fourchette. Ils montent un peu avec les calories.
          </li>
          <li>
            <b>Glucides : {macros.carbs} g.</b> C'est là que va la hausse, ce sont eux qui nourrissent tes séances.
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>Poids</h2>
        {gel ? <p className="muted">Pendant les hausses de calories, ton poids monte surtout par l'eau. On ne le lit pas avant le {dayMonth(gel)}.</p> : null}
        <TimeChart
          series={[
            { id: 'raw', label: 'Pesées', color: 'var(--ink-3)', points: raw, kind: 'dots' },
            { id: 'trend', label: 'Tendance', color: 'var(--mint)', points: trend },
          ]}
          from={from}
          to={today}
          format={(n) => `${fr1(n)} kg`}
          empty="Ta courbe apparaît après ta première pesée."
        />
      </section>

      <section className="card">
        <h2>Ton maintien</h2>
        <p className="metric num">{int(Math.round(maintenance.value / 10) * 10)} kcal</p>
        <p className="muted">
          Calories où ton poids ne bouge pas, entre {int(Math.round(maintenance.low / 10) * 10)} et {int(Math.round(maintenance.high / 10) * 10)} kcal. {maintenance.source === 'data' ? 'Calculé sur tes 28 derniers jours.' : 'Estimation de départ, elle s\'affine avec tes données.'}
        </p>
      </section>
    </div>
  );
}

const FIELDS: { key: keyof DayLog; label: string; unit: string; group: 'food' | 'steps' | 'body'; decimals?: boolean }[] = [
  { key: 'kcal', label: 'Calories', unit: 'kcal', group: 'food' },
  { key: 'protein', label: 'Protéines', unit: 'g', group: 'food' },
  { key: 'carbs', label: 'Glucides', unit: 'g', group: 'food' },
  { key: 'fat', label: 'Lipides', unit: 'g', group: 'food' },
  { key: 'steps', label: 'Pas', unit: 'pas', group: 'steps' },
  { key: 'waist', label: 'Tour de taille', unit: 'cm', group: 'body', decimals: true },
];

export function DayEntry({ open, onClose, today }: { open: boolean; onClose(): void; today: ISODate }) {
  return (
    <Sheet open={open} onClose={onClose} label="Noter ma journée">
      {open ? <Entry today={today} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Entry({ today, onClose }: { today: ISODate; onClose(): void }) {
  const days = useApp((r) => r.data.days);
  const [which, setWhich] = useState<'today' | 'yesterday'>('today');
  const date = which === 'today' ? today : addDays(today, -1);
  const [edits, setEdits] = useState<Record<string, Partial<DayLog>>>({});
  const [pad, setPad] = useState<(typeof FIELDS)[number] | null>(null);
  const draft = { ...days[date], ...edits[date] };

  return (
    <div className="entry">
      <SheetHead title="Ma journée" onClose={onClose} />
      <Segmented<'today' | 'yesterday'> label="Jour" value={which} onPick={setWhich} options={[{ value: 'today', label: 'Aujourd\'hui' }, { value: 'yesterday', label: 'Hier' }]} />
      <ul className="fields">
        {FIELDS.map((f) => {
          const v = draft[f.key];
          return (
            <li key={f.key}>
              <button type="button" onClick={() => setPad(f)}>
                <span>{f.label}</span>
                <b className="num">{typeof v === 'number' ? `${f.key === 'waist' ? kg(v) : int(v)} ${f.unit}` : '–'}</b>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="btn primary big"
        onClick={() => {
          for (const [d, patch] of Object.entries(edits)) {
            const keys = Object.keys(patch);
            updateDay(d, { ...patch, ...(keys.some((k) => FIELDS.find((f) => f.key === k)?.group === 'food') ? { manualFood: true } : {}), ...(keys.includes('steps') ? { manualSteps: true } : {}) });
          }
          onClose();
        }}
      >
        Enregistrer
      </button>
      {pad ? (
        <Keypad
          title={pad.label}
          unit={pad.unit}
          decimals={!!pad.decimals}
          initial={typeof draft[pad.key] === 'number' ? (draft[pad.key] as number) : 0}
          onCancel={() => setPad(null)}
          onDone={(n) => {
            setEdits((e) => ({ ...e, [date]: { ...e[date], [pad.key]: n } }));
            setPad(null);
          }}
        />
      ) : null}
    </div>
  );
}
