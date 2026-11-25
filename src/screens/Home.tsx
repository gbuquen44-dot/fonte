import React, { useEffect, useMemo, useState } from 'react';
import { activeSession, beginSession, doneSessions, isStale, startLock, stopLock, useApp } from '../state/store';
import { addDays, diffDays, longDate, mondayOf, shortDate } from '../core/dates';
import { clock, formatMinutes, PROJECT_SHORT, PROJECTS, runningBlock, todayList, workMinutes, type Project } from '../core/head';
import { macrosFor, targetKcal, weighIns } from '../core/energy';
import { tipOfDay } from '../core/rules';
import { plural } from '../core/labels';
import { plannedFor } from '../core/program';
import type { PlannedSession } from '../core/types';
import { EXERCISES, MUSCLE_LABEL } from '../data/exercises';
import { fr1, hours, int } from '../ui/controls';
import { IconChevron, IconLink } from '../ui/icons';
import { GlyphBowl, GlyphDumbbell, GlyphLock, GlyphMoon, GlyphPlay, GlyphScale, GlyphSliders, GlyphStop, GlyphTodo } from '../ui/glyphs';
import { useToday } from '../ui/hooks';
import { prepareAudio } from '../ui/sound';
import { nextPlanned, sameSession } from './Today';
import { startOf } from './Head';

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

const LOCK_PROJECTS: Project[] = ['biz', 'ecole', 'perso'];
const WEEK_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const BAR_MAX = 54;

/** The Lock-in card: today's real work in big, the week in bars coloured by project, one tap to start. */
function LockTile() {
  const work = useApp((r) => r.data.work);
  const today = useToday();
  const run = runningBlock(work, today);
  const now = useNow(!!run);
  const total = workMinutes(work[today], now).total;
  const monday = mondayOf(today);
  const week = WEEK_LETTERS.map((letter, i) => {
    const date = addDays(monday, i);
    return { letter, date, by: date > today ? null : workMinutes(work[date], now).by };
  });
  const dayTotal = (by: Record<Project, number> | null) => (by ? PROJECTS.reduce((a, p) => a + by[p], 0) : 0);
  const weekTotal = week.reduce((a, d) => a + dayTotal(d.by), 0);
  const scale = Math.max(180, ...week.map((d) => dayTotal(d.by)));

  return (
    <section className={`tile lock-tile span-2${run ? ' running' : ''}`} aria-live={run ? 'polite' : undefined}>
      <div className="lock-top">
        <div>
          <span className="tile-head">
            <span className="tile-ic pc-biz">
              <GlyphLock size={17} />
            </span>
            {run ? `En cours · ${PROJECT_SHORT[run.block.project]}` : 'Lock-in'}
          </span>
          <p className="lock-big num">{run ? clock(now - run.block.start) : total ? formatMinutes(total) : '0 min'}</p>
          <p className="lock-week">{weekTotal ? `${formatMinutes(weekTotal)} cette semaine` : 'Rien encore cette semaine'}</p>
        </div>
        <div className="week-bars" role="img" aria-label="Tes heures de Lock-in cette semaine, jour par jour et par projet">
          {week.map((d, i) => (
            <span key={i} className={d.date === today ? 'today' : ''}>
              <span className="stack">
                {d.by && dayTotal(d.by) ? (
                  PROJECTS.filter((p) => d.by![p]).map((p) => <i key={p} className={`pc-${p}`} style={{ height: `${Math.max(3, Math.round((d.by![p] / scale) * BAR_MAX))}px` }} />)
                ) : (
                  <i className="empty" />
                )}
              </span>
              <small>{d.letter}</small>
            </span>
          ))}
        </div>
      </div>
      {run ? (
        <button type="button" className="lock-act stop" onClick={stopLock}>
          <GlyphStop size={16} /> Stop
        </button>
      ) : (
        <div className="lock-acts">
          {LOCK_PROJECTS.map((p) => (
            <button key={p} type="button" className={`lock-act pc-${p}`} onClick={() => startLock(p)}>
              <i className="pdot" /> {PROJECT_SHORT[p]}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** The last weigh-ins as a soft green line with its area. */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="spark-empty" />;
  const lo = Math.min(...values) - 0.2;
  const hi = Math.max(...values) + 0.2;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(3 + ((hi - v) / (hi - lo)) * 24).toFixed(1)}`);
  return (
    <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`${pts.join(' ')} 100,30 0,30`} />
      <polyline points={pts.join(' ')} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A small progress ring. */
function Ring({ value }: { value: number }) {
  const c = 2 * Math.PI * 15;
  return (
    <svg className="todo-ring" width="38" height="38" viewBox="0 0 38 38" aria-hidden="true">
      <circle cx="19" cy="19" r="15" className="ring-bg" />
      <circle cx="19" cy="19" r="15" className="ring-fg" strokeDasharray={`${Math.max(0.001, Math.min(1, value)) * c} ${c}`} />
    </svg>
  );
}

/** The main muscles of a session, by number of sets, in plain words. */
function musclesOf(plan: PlannedSession): string[] {
  const sets: Record<string, number> = {};
  for (const e of plan.exercises) {
    const muscles = EXERCISES[e.exId]?.muscles ?? {};
    for (const [m, w] of Object.entries(muscles)) if (w >= 1) sets[m] = (sets[m] ?? 0) + e.sets.length;
  }
  return Object.entries(sets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([m]) => MUSCLE_LABEL[m] ?? m);
}

export function Home({ onSession, onSettings, onCheckin, onFood, onHead }: { onSession(): void; onSettings(): void; onCheckin(): void; onFood(): void; onHead(): void }) {
  const data = useApp((r) => r.data);
  const sync = useApp((r) => r.sync);
  const today = useToday();
  const p = data.profile!;
  const day = data.days[today];

  const list = useMemo(() => todayList(Object.values(data.todos), today, startOf(today)), [data.todos, today]);
  const done = list.filter((t) => t.doneAt).length;
  const next = list.find((t) => !t.doneAt);

  const weights = useMemo(() => weighIns(data.days).slice(-7), [data.days]);
  const lastWeight = weights[weights.length - 1]?.weight;
  const average = weights.length ? weights.reduce((a, w) => a + w.weight, 0) / weights.length : undefined;

  const nights = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = data.days[addDays(today, i - 6)];
        return d?.checkinAt && d.sleepH !== undefined ? d.sleepH : null;
      }),
    [data.days, today],
  );
  const longest = Math.max(6, ...nights.map((n) => n ?? 0));

  const sessions = useMemo(() => doneSessions(data), [data.sessions]);
  const active = activeSession(data);
  const planned = plannedFor(today, p);
  const doneToday = planned ? sameSession(sessions, planned) : undefined;
  const upcoming = nextPlanned(today, p, sessions);
  const featured = !active && !doneToday ? (planned ? { date: today, plan: planned } : upcoming) : null;
  const soon = featured && featured.date !== today ? diffDays(featured.date, today) : 0;
  const tip = useMemo(() => tipOfDay({ today, profile: p, days: data.days, sessions, planned: doneToday ? null : planned }), [today, p, data.days, sessions, planned, doneToday]);

  const target = targetKcal(p.kcalPlan, today) ?? 0;
  const macros = macrosFor(target, lastWeight ?? 68);
  const kcal = day?.kcal ?? 0;
  const protein = day?.protein ?? 0;

  const start = (plan: PlannedSession) => {
    prepareAudio();
    beginSession(plan, today);
    onSession();
  };

  return (
    <div className="screen">
      <header className="head">
        <div>
          <p>{longDate(today)}</p>
          <h1>Aujourd'hui</h1>
        </div>
        <button type="button" className="round big" onClick={onSettings} aria-label="Réglages">
          <GlyphSliders size={20} />
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

      <div className="tiles">
        <LockTile />

        <button type="button" className="tile" onClick={onCheckin}>
          <span className="tile-head">
            <span className="tile-ic pc-salle">
              <GlyphScale size={17} />
            </span>
            Poids
          </span>
          {lastWeight !== undefined ? (
            <span className="tile-big num">
              {fr1(day?.weight ?? lastWeight)}
              <small> kg</small>
            </span>
          ) : (
            <span className="tile-big add">+ noter</span>
          )}
          <Spark values={weights.map((w) => w.weight)} />
          <span className="tile-foot">{day?.weight === undefined ? 'Pas encore pesé ce matin' : average !== undefined ? `Moyenne ${fr1(average)}` : 'Pesé ce matin'}</span>
        </button>

        <button type="button" className="tile" onClick={onHead}>
          <span className="tile-head">
            <span className="tile-ic pc-biz">
              <GlyphTodo size={17} />
            </span>
            To-do
          </span>
          <span className="tile-row">
            <span className="tile-big num">
              {done}
              <small> / {list.length}</small>
            </span>
            <Ring value={list.length ? done / list.length : 0} />
          </span>
          <span className="tile-foot ellipsis">{next ? `Ensuite · ${next.title}` : list.length ? 'Tout est fait' : 'Dicte ce que tu dois faire'}</span>
        </button>

        {active || doneToday || featured ? (
          <section className="tile session-tile span-2">
            <span className="tile-ic big pc-salle">
              <GlyphDumbbell size={22} />
            </span>
            <div className="session-main">
              <span className="session-tag">{active ? (isStale(active) ? `Pas terminée · ${shortDate(active.date)}` : 'Séance en cours') : doneToday ? 'Séance faite' : soon ? (soon === 1 ? 'Séance demain' : `Séance ${longDate(featured!.date)}`) : 'Séance du jour'}</span>
              <span className="session-name">{active ? active.title : doneToday ? doneToday.title : featured!.plan.title}</span>
              <span className="tile-foot">
                {active ? `${active.sets.length} ${plural(active.sets.length, 'série notée', 'séries notées')}` : doneToday ? 'Mange, et ça pousse.' : musclesOf(featured!.plan).join(' · ')}
              </span>
            </div>
            {active ? (
              <button type="button" className="play" onClick={onSession} aria-label={isStale(active) ? 'Terminer la séance' : 'Reprendre la séance'}>
                <GlyphPlay size={18} />
              </button>
            ) : featured ? (
              <button type="button" className="play" onClick={() => start(featured.plan)} aria-label={`Lancer la séance ${featured.plan.title}`}>
                <GlyphPlay size={18} />
              </button>
            ) : null}
          </section>
        ) : null}

        <button type="button" className="tile" onClick={onCheckin}>
          <span className="tile-head">
            <span className="tile-ic pc-ecole">
              <GlyphMoon size={17} />
            </span>
            Sommeil
          </span>
          {day?.sleepH !== undefined && day.checkinAt ? <span className="tile-big num">{hours(day.sleepH)}</span> : <span className="tile-big add">+ noter</span>}
          <span className="nights" aria-hidden="true">
            {nights.map((n, i) => (
              <i key={i} className={i === 6 ? 'last' : n === null ? 'none' : ''} style={{ height: `${n === null ? 3 : Math.max(4, Math.round((n / longest) * 16))}px` }} />
            ))}
          </span>
          <span className="tile-foot">{day?.recovery !== undefined ? `Forme ${day.recovery}/10` : 'Ton point du matin'}</span>
        </button>

        <button type="button" className="tile" onClick={onFood}>
          <span className="tile-head">
            <span className="tile-ic pc-perso">
              <GlyphBowl size={17} />
            </span>
            Manger
          </span>
          <span className="tile-big num">
            {int(kcal)}
            <small> / {int(target)}</small>
          </span>
          <span className="bar amber" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (kcal / Math.max(1, target)) * 100)}%` }} />
          </span>
          <span className="tile-foot num">
            Protéines {int(protein)} / {macros.protein} g
          </span>
        </button>
      </div>

      {tip.urgent || tip.origin === 'Sécurité' ? (
        <section className={`card tip${tip.urgent ? ' urgent' : ''}`}>
          <h2>{tip.title}</h2>
          <p>{tip.body}</p>
        </section>
      ) : null}
    </div>
  );
}
