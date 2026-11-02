import React, { useMemo } from 'react';
import { activeSession, beginSession, doneSessions, useApp } from '../state/store';
import { addDays, DAY_LABEL, dayKey, diffDays, longDate, mondayOf, type ISODate } from '../core/dates';
import { estimateMinutes, locate, plannedFor } from '../core/program';
import { macrosFor, targetKcal, weighIns } from '../core/energy';
import { tipOfDay } from '../core/rules';
import { plural } from '../core/labels';
import type { PlannedSession, Profile, SessionLog } from '../core/types';
import { EXERCISES } from '../data/exercises';
import { fr1, hours, int, Ring } from '../ui/controls';
import { IconCheck, IconChevron, IconGear, IconMoon } from '../ui/icons';
import { useToday } from '../ui/hooks';
import { prepareAudio } from '../ui/sound';

export const sameSession = (sessions: SessionLog[], plan: PlannedSession) => sessions.find((s) => s.block === plan.block && s.week === plan.week && s.key === plan.key);

function nextPlanned(today: ISODate, p: Profile, sessions: SessionLog[]): { date: ISODate; plan: PlannedSession } | null {
  for (let i = 0; i < 9; i++) {
    const date = addDays(today, i);
    const plan = plannedFor(date, p);
    if (plan && !sameSession(sessions, plan)) return { date, plan };
  }
  return null;
}

const STEPS_GOAL = 8000;

export function Today({ onSession, onSettings, onCheckin, onEntry }: { onSession(): void; onSettings(): void; onCheckin(): void; onEntry(): void }) {
  const data = useApp((r) => r.data);
  const today = useToday();
  const p = data.profile!;
  const sessions = useMemo(() => doneSessions(data), [data.sessions]);
  const active = activeSession(data);
  const day = data.days[today];
  const planned = plannedFor(today, p);
  const doneToday = planned ? sameSession(sessions, planned) : undefined;
  const upcoming = nextPlanned(today, p, sessions);
  const tip = useMemo(() => tipOfDay({ today, profile: p, days: data.days, sessions, planned: doneToday ? null : planned }), [today, p, data.days, sessions, planned, doneToday]);
  const loc = locate(today, p.programStart);
  const target = targetKcal(p.kcalPlan, today) ?? 0;
  const lastWeight = useMemo(() => weighIns(data.days).pop()?.weight ?? 68, [data.days]);
  const macros = macrosFor(target, lastWeight);

  const start = (plan: PlannedSession) => {
    prepareAudio();
    beginSession(plan, today);
    onSession();
  };

  const featured = !active && !doneToday ? (planned ? { date: today, plan: planned } : upcoming) : null;
  const soon = featured && featured.date !== today ? diffDays(featured.date, today) : 0;

  return (
    <div className="screen">
      <header className="head">
        <div>
          <p>{longDate(today)}</p>
          <h1>Aujourd'hui</h1>
        </div>
        <button type="button" className="round big" onClick={onSettings} aria-label="Réglages">
          <IconGear size={22} />
        </button>
      </header>

      {!day?.checkinAt ? (
        <button type="button" className="card nudge" onClick={onCheckin}>
          <span className="nudge-icon">
            <IconMoon size={22} />
          </span>
          <span>
            <strong>Ton point du matin</strong>
            <small>Poids, sommeil, forme. 30 secondes.</small>
          </span>
          <IconChevron size={20} />
        </button>
      ) : null}

      {active ? (
        <section className="card hero">
          <p className="hero-tag">Séance en cours</p>
          <h2>{active.title}</h2>
          <p className="hero-sub num">
            {active.sets.length} {plural(active.sets.length, 'série notée', 'séries notées')}
          </p>
          <button type="button" className="btn primary big" onClick={onSession}>
            Reprendre
          </button>
        </section>
      ) : doneToday ? (
        <section className="card hero done">
          <p className="hero-tag">
            <IconCheck size={16} /> Séance faite
          </p>
          <h2>{doneToday.title}</h2>
          <p className="hero-sub">Mange, et ça pousse.{upcoming ? ` Prochaine séance : ${DAY_LABEL[dayKey(upcoming.date)].toLowerCase()}.` : ''}</p>
        </section>
      ) : featured ? (
        <SessionCard plan={featured.plan} date={featured.date} soon={soon} block={loc?.block ?? 1} onStart={() => start(featured.plan)} />
      ) : null}

      <section className="card day" aria-label="Ta journée">
        <button type="button" className="day-ring" onClick={onEntry}>
          <Ring value={day?.kcal ?? 0} max={target} color="var(--mint)">
            <b className="num">{day?.kcal !== undefined ? int(day.kcal) : '–'}</b>
          </Ring>
          <strong>Calories</strong>
          <small className="num">sur {int(target)}</small>
        </button>
        <button type="button" className="day-ring" onClick={onEntry}>
          <Ring value={day?.protein ?? 0} max={macros.protein} color="var(--sky)">
            <b className="num">{day?.protein !== undefined ? `${int(day.protein)}` : '–'}</b>
          </Ring>
          <strong>Protéines</strong>
          <small className="num">sur {macros.protein} g</small>
        </button>
        <button type="button" className="day-ring" onClick={onEntry}>
          <Ring value={day?.steps ?? 0} max={STEPS_GOAL} color="var(--amber)">
            <b className="num">{day?.steps !== undefined ? (day.steps >= 10000 ? `${fr1(day.steps / 1000)} k` : int(day.steps)) : '–'}</b>
          </Ring>
          <strong>Pas</strong>
          <small className="num">sur {int(STEPS_GOAL)}</small>
        </button>
      </section>

      <section className={`card tip${tip.urgent ? ' urgent' : ''}`}>
        <h2>{tip.title}</h2>
        <p>{tip.body}</p>
      </section>

      {day?.checkinAt ? (
        <button type="button" className="card morning" onClick={onCheckin}>
          <span>
            <small>Sommeil</small>
            <b className="num">{day.sleepH !== undefined ? hours(day.sleepH) : '–'}</b>
          </span>
          <span>
            <small>Poids</small>
            <b className="num">{day.weight !== undefined ? `${fr1(day.weight)} kg` : '–'}</b>
          </span>
          <span>
            <small>Forme</small>
            <b className="num">{day.recovery !== undefined ? `${day.recovery}/10` : '–'}</b>
          </span>
        </button>
      ) : null}

      <WeekStrip today={today} profile={p} sessions={sessions} />
    </div>
  );
}

function SessionCard({ plan, date, soon, block, onStart }: { plan: PlannedSession; date: ISODate; soon: number; block: number; onStart(): void }) {
  const list = plan.exercises.slice(0, 5);
  const rest = plan.exercises.length - list.length;
  return (
    <section className="card hero">
      <p className="hero-tag">{soon ? `${soon === 1 ? 'Demain' : longDate(date)}` : `Séance du jour`} · Bloc {block}, semaine {plan.week}</p>
      <h2>{plan.title}</h2>
      <p className="hero-sub num">
        {plan.exercises.length} {plural(plan.exercises.length, 'exercice')} · environ {estimateMinutes(plan)} min
      </p>
      <ul className="hero-list">
        {list.map((e) => (
          <li key={e.exId}>
            <span>{EXERCISES[e.exId]?.name}</span>
            <span className="num">
              {e.sets.length} {plural(e.sets.length, 'série')}
            </span>
          </li>
        ))}
        {rest > 0 ? <li className="more">et {rest} {plural(rest, 'autre')}</li> : null}
      </ul>
      <button type="button" className={`btn ${soon ? 'ghost' : 'primary big'}`} onClick={onStart}>
        {soon ? 'Lancer maintenant' : 'Lancer la séance'}
      </button>
    </section>
  );
}

function WeekStrip({ today, profile, sessions }: { today: ISODate; profile: Profile; sessions: SessionLog[] }) {
  const monday = mondayOf(today);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return (
    <ol className="week card" aria-label="Ta semaine">
      {dates.map((d) => {
        const plan = plannedFor(d, profile);
        const done = plan ? sameSession(sessions, plan) : undefined;
        const state = done ? 'done' : !plan ? 'off' : d < today ? 'missed' : 'planned';
        return (
          <li key={d} data-state={state} data-now={d === today ? 'true' : undefined}>
            <span>{DAY_LABEL[dayKey(d)].slice(0, 1)}</span>
            <i>{done ? <IconCheck size={14} /> : null}</i>
          </li>
        );
      })}
    </ol>
  );
}
