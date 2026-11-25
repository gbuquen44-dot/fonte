import React, { useEffect, useMemo, useState } from 'react';
import { activeSession, beginSession, doneSessions, isStale, startLock, stopLock, useApp } from '../state/store';
import { addDays, diffDays, longDate, mondayOf, shortDate } from '../core/dates';
import { clock, formatMinutes, PROJECT_SHORT, runningBlock, todayList, workMinutes, type Project } from '../core/head';
import { macrosFor, targetKcal, weighIns } from '../core/energy';
import { tipOfDay } from '../core/rules';
import { plural } from '../core/labels';
import { plannedFor } from '../core/program';
import type { PlannedSession } from '../core/types';
import { EXERCISES, MUSCLE_LABEL } from '../data/exercises';
import { fr1, hours, int } from '../ui/controls';
import { IconCheck, IconChevron, IconGear, IconLink, IconPlay, IconStop } from '../ui/icons';
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

/** The red tile: the running chrono, or today's total and one tap per project, with the week in bars. */
function LockTile() {
  const work = useApp((r) => r.data.work);
  const today = useToday();
  const run = runningBlock(work, today);
  const now = useNow(!!run);
  const total = workMinutes(work[today], now).total;
  const monday = mondayOf(today);
  const week = WEEK_LETTERS.map((letter, i) => {
    const date = addDays(monday, i);
    return { letter, date, minutes: date > today ? 0 : workMinutes(work[date], now).total };
  });
  const scale = Math.max(120, ...week.map((d) => d.minutes));

  return (
    <section className="tile lock-tile span-2" aria-live={run ? 'polite' : undefined}>
      <div className="lock-top">
        <div>
          <p className="tile-tag">{run ? `Lock-in en cours · ${PROJECT_SHORT[run.block.project]}` : 'Lock-in aujourd\'hui'}</p>
          <p className="lock-big num">{run ? clock(now - run.block.start) : total ? formatMinutes(total) : '0 min'}</p>
        </div>
        <div className="week-bars" role="img" aria-label="Tes heures de Lock-in cette semaine, jour par jour">
          {week.map((d, i) => (
            <span key={i} className={d.date === today ? 'today' : d.date > today ? 'later' : ''}>
              <i style={{ height: `${Math.max(5, Math.round((d.minutes / scale) * 60))}px` }} />
              <small>{d.letter}</small>
            </span>
          ))}
        </div>
      </div>
      {run ? (
        <button type="button" className="lock-act stop" onClick={stopLock}>
          <IconStop size={16} /> Stop
        </button>
      ) : (
        <div className="lock-acts">
          {LOCK_PROJECTS.map((p) => (
            <button key={p} type="button" className="lock-act" onClick={() => startLock(p)}>
              <IconPlay size={13} /> {PROJECT_SHORT[p]}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** A little line through the last weigh-ins, the newest one dotted. */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="spark-empty" />;
  const lo = Math.min(...values) - 0.2;
  const hi = Math.max(...values) + 0.2;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 4 + ((hi - v) / (hi - lo)) * 32]);
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="3" vectorEffect="non-scaling-stroke" />
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

      <div className="tiles">
        <LockTile />

        <button type="button" className="tile" onClick={onCheckin}>
          <span className="tile-label">Poids</span>
          {lastWeight !== undefined ? (
            <span className="tile-big num">
              {fr1(day?.weight ?? lastWeight)}
              <small> kg</small>
            </span>
          ) : (
            <span className="tile-big add">+ noter</span>
          )}
          <Spark values={weights.map((w) => w.weight)} />
          <span className={`tile-foot${day?.weight !== undefined ? ' good' : ''}`}>
            {day?.weight === undefined ? 'Pas encore pesé ce matin' : average !== undefined ? `Moyenne ${fr1(average)}` : 'Pesé ce matin'}
          </span>
        </button>

        <button type="button" className="tile" onClick={onHead}>
          <span className="tile-label">To-do</span>
          <span className="tile-big num">
            {done}
            <small> / {list.length}</small>
          </span>
          <span className="bar" aria-hidden="true">
            <i style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} />
          </span>
          <span className="tile-foot clamp">{next ? `Ensuite : ${next.title}` : list.length ? 'Tout est fait' : 'Dicte ce que tu dois faire'}</span>
        </button>

        {active ? (
          <section className="tile session-tile span-2">
            <div className="session-main">
              <span className="tile-tag good">{isStale(active) ? `Pas terminée · ${shortDate(active.date)}` : 'Séance en cours'}</span>
              <span className="session-name">{active.title}</span>
              <span className="tile-foot num">
                {active.sets.length} {plural(active.sets.length, 'série notée', 'séries notées')}
              </span>
            </div>
            <button type="button" className="play" onClick={onSession} aria-label={isStale(active) ? 'Terminer la séance' : 'Reprendre la séance'}>
              <IconPlay size={22} />
            </button>
          </section>
        ) : doneToday ? (
          <section className="tile session-tile span-2">
            <div className="session-main">
              <span className="tile-tag good">
                <IconCheck size={14} /> Séance faite
              </span>
              <span className="session-name">{doneToday.title}</span>
              <span className="tile-foot">Mange, et ça pousse.</span>
            </div>
          </section>
        ) : featured ? (
          <section className="tile session-tile span-2">
            <div className="session-main">
              <span className="tile-tag good">{soon ? (soon === 1 ? 'Séance demain' : `Séance ${longDate(featured.date)}`) : 'Séance du jour'}</span>
              <span className="session-name">{featured.plan.title}</span>
              <span className="chips">
                {musclesOf(featured.plan).map((m) => (
                  <span key={m} className="chip-m">
                    {m}
                  </span>
                ))}
              </span>
            </div>
            <button type="button" className="play" onClick={() => start(featured.plan)} aria-label={`Lancer la séance ${featured.plan.title}`}>
              <IconPlay size={22} />
            </button>
          </section>
        ) : null}

        <button type="button" className="tile" onClick={onCheckin}>
          <span className="tile-label">Sommeil</span>
          {day?.sleepH !== undefined && day.checkinAt ? <span className="tile-big num">{hours(day.sleepH)}</span> : <span className="tile-big add">+ noter</span>}
          <span className="tile-foot">{day?.recovery !== undefined ? `Forme ${day.recovery}/10` : 'Ton point du matin'}</span>
        </button>

        <button type="button" className="tile" onClick={onFood}>
          <span className="tile-label">Manger</span>
          <span className="tile-big num">
            {int(kcal)}
            <small> / {int(target)}</small>
          </span>
          <span className="mini-bar">
            <span>Protéines</span>
            <span className="bar amber" aria-hidden="true">
              <i style={{ width: `${Math.min(100, (protein / Math.max(1, macros.protein)) * 100)}%` }} />
            </span>
          </span>
          <span className="tile-foot num">
            {int(protein)} / {macros.protein} g
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
