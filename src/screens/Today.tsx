import React, { useMemo } from 'react';
import { activeSession, beginSession, doneSessions, isStale, useApp } from '../state/store';
import { addDays, DAY_LABEL, dayKey, diffDays, longDate, shortDate, type ISODate } from '../core/dates';
import { estimateMinutes, locate, plannedFor } from '../core/program';
import { macrosFor, targetKcal, weighIns } from '../core/energy';
import { tipOfDay } from '../core/rules';
import { plural } from '../core/labels';
import type { PlannedSession, Profile, SessionLog } from '../core/types';
import { EXERCISES } from '../data/exercises';
import { fr1, hours, int } from '../ui/controls';
import { IconCheck, IconChevron, IconGear, IconLink } from '../ui/icons';
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

export function Today({ onSession, onSettings, onCheckin, onFood }: { onSession(): void; onSettings(): void; onCheckin(): void; onFood(): void }) {
  const data = useApp((r) => r.data);
  const sync = useApp((r) => r.sync);
  const today = useToday();
  const p = data.profile!;
  const sessions = useMemo(() => doneSessions(data), [data.sessions]);
  const active = activeSession(data);
  const day = data.days[today];
  const planned = plannedFor(today, p);
  const doneToday = planned ? sameSession(sessions, planned) : undefined;
  const upcoming = nextPlanned(today, p, sessions);
  const tip = useMemo(() => tipOfDay({ today, profile: p, days: data.days, sessions, planned: doneToday ? null : planned }), [today, p, data.days, sessions, planned, doneToday]);
  const loc = locate(today, p.programStart, p.moves);
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

      {sync === 'denied' ? (
        <button type="button" className="card nudge" onClick={onSettings}>
          <span className="nudge-icon">
            <IconLink size={22} />
          </span>
          <span>
            <strong>Ta sauvegarde est coupée</strong>
            <small>Ton jeton GitHub ne marche plus.</small>
          </span>
          <IconChevron size={20} />
        </button>
      ) : null}

      <button type="button" className="card morning" onClick={onCheckin} aria-label="Ton point du matin">
        <span>
          <small>Poids</small>
          {day?.weight !== undefined ? <b className="num">{fr1(day.weight)}</b> : <b className="todo">+ noter</b>}
        </span>
        <span>
          <small>Sommeil</small>
          {day?.sleepH !== undefined && day.checkinAt ? <b className="num">{hours(day.sleepH)}</b> : <b className="todo">+ noter</b>}
        </span>
        <span>
          <small>Forme</small>
          {day?.recovery !== undefined ? <b className="num">{day.recovery}/10</b> : <b className="todo">+ noter</b>}
        </span>
        <IconChevron size={18} />
      </button>

      {active ? (
        <section className="card hero">
          <p className="hero-tag">{isStale(active) ? `Pas terminée · ${shortDate(active.date)}` : 'Séance en cours'}</p>
          <h2>{active.title}</h2>
          <p className="hero-sub num">
            {active.sets.length} {plural(active.sets.length, 'série notée', 'séries notées')}
          </p>
          <button type="button" className="btn primary big" onClick={onSession}>
            {isStale(active) ? 'La terminer' : 'Reprendre'}
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

      <button type="button" className="card eat" onClick={onFood}>
        <span className="eat-row">
          <strong>Manger</strong>
          <span className="num">
            {day?.kcal !== undefined ? int(day.kcal) : 0} / {int(target)} kcal
          </span>
        </span>
        <span className="eat-bar" aria-hidden="true">
          <i style={{ width: `${Math.min(100, ((day?.kcal ?? 0) / Math.max(1, target)) * 100)}%` }} />
        </span>
        <span className="eat-row sub">
          <span>Protéines</span>
          <span className="num">
            {day?.protein !== undefined ? int(day.protein) : 0} / {macros.protein} g
          </span>
        </span>
      </button>

      {tip.urgent || tip.origin === 'Sécurité' ? (
        <section className={`card tip${tip.urgent ? ' urgent' : ''}`}>
          <h2>{tip.title}</h2>
          <p>{tip.body}</p>
        </section>
      ) : null}
    </div>
  );
}

function SessionCard({ plan, date, soon, block, onStart }: { plan: PlannedSession; date: ISODate; soon: number; block: number; onStart(): void }) {
  const list = plan.exercises.slice(0, 5);
  const rest = plan.exercises.length - list.length;
  return (
    <section className="card hero">
      <p className="hero-tag">{soon ? `${soon === 1 ? 'Demain' : longDate(date)}` : `Séance du jour`}{block === 0 ? ` · Semaine ${plan.week}${plan.week === 1 ? ', légère' : ''}` : ` · Bloc ${block}, semaine ${plan.week}`}</p>
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
