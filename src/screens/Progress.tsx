import React, { useMemo, useState } from 'react';
import { doneSessions, useApp } from '../state/store';
import { addDays, dateRange, diffDays, shortDate, type ISODate } from '../core/dates';
import { ewma, weighIns } from '../core/energy';
import { currentE1rm, e1rmSeries, LIFT_LABEL, LIFTS, liftTrend, rolling3 } from '../core/lifting';
import { loggedVolume } from '../core/volume';
import type { LiftKey, PRBadge } from '../core/types';
import { TimeChart, TotalRoad, VolumeBars, type Pt } from '../ui/Chart';
import { fr1, hours, int, kg, Segmented } from '../ui/controls';
import { useToday } from '../ui/hooks';

const COLORS: Record<LiftKey, string> = { squat: 'var(--c-squat)', bench: 'var(--c-bench)', deadlift: 'var(--c-dead)' };

export function Progress() {
  const data = useApp((r) => r.data);
  const p = data.profile!;
  const today = useToday();
  const [range, setRange] = useState(30);
  const from = addDays(today, -range);
  const sessions = useMemo(() => doneSessions(data), [data.sessions]);
  const series = (f: 'sleepH' | 'recovery' | 'kcal' | 'steps'): Pt[] =>
    Object.values(data.days)
      .filter((d) => typeof d[f] === 'number')
      .map((d) => ({ date: d.date, y: d[f] as number }))
      .sort((a, b) => a.date.localeCompare(b.date));
  const mean7 = (pts: Pt[]): Pt[] =>
    pts.map((q) => {
      const w = pts.filter((x) => diffDays(q.date, x.date) >= 0 && diffDays(q.date, x.date) < 7);
      return { date: q.date, y: w.reduce((a, b) => a + b.y, 0) / w.length };
    });

  const weights = useMemo(() => weighIns(data.days), [data.days]);
  const estimated = LIFTS.reduce((a, l) => a + currentE1rm(sessions, l, p.tm[l]), 0);
  const startTotal = LIFTS.reduce((a, l) => a + p.tm[l], 0);
  const goalTotal = LIFTS.reduce((a, l) => a + p.goal[l], 0);
  const liftSeries = LIFTS.map((l) => ({
    id: l,
    label: LIFT_LABEL[l],
    color: COLORS[l],
    points: rolling3(e1rmSeries(sessions, l)).map((x) => ({ date: x.date, y: x.value })),
  }));
  const volume = useMemo(() => {
    const set = new Set(dateRange(today, 7));
    return loggedVolume(sessions.filter((s) => set.has(s.date)));
  }, [sessions, today]);
  const prs = useMemo(
    () =>
      sessions
        .flatMap((s) => s.prs.map((b) => ({ ...b, date: s.date })))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 8) as (PRBadge & { date: ISODate })[],
    [sessions],
  );
  const sleep = series('sleepH');
  const nextGoal = p.milestones.find((m) => m.total > estimated);

  return (
    <div className="screen">
      <header className="head">
        <div>
          <p>Squat + bench + deadlift</p>
          <h1>Progrès</h1>
        </div>
      </header>

      <section className="card total">
        <p className="total-value num">
          {int(estimated)} <small>kg</small>
        </p>
        <p className="muted">
          Ton total estimé. {nextGoal ? `Prochain cap : ${int(nextGoal.total)} kg (${nextGoal.label.toLowerCase()}).` : ''} Objectif {int(goalTotal)} kg.
        </p>
        <TotalRoad current={estimated} start={Math.min(startTotal, estimated) - 20} milestones={p.milestones} />
      </section>

      <ul className="lifts">
        {LIFTS.map((l) => {
          const t = liftTrend(sessions, l);
          const now = currentE1rm(sessions, l, p.tm[l]);
          const ratio = Math.min(1, now / p.goal[l]);
          return (
            <li key={l} className="card" style={{ '--c': COLORS[l] } as React.CSSProperties}>
              <span>{LIFT_LABEL[l]}</span>
              <b className="num">{kg(Math.round(now * 2) / 2)}</b>
              <small className="num">objectif {kg(p.goal[l])}</small>
              <i>
                <em style={{ transform: `scaleX(${ratio})` }} />
              </i>
              {t?.verdict === 'probable' ? <small className="up">en progrès</small> : null}
            </li>
          );
        })}
      </ul>

      <Segmented<number> label="Période" value={range} onPick={setRange} options={[{ value: 30, label: '30 jours' }, { value: 90, label: '90 jours' }, { value: 365, label: '1 an' }]} />

      <section className="card">
        <h2>Force</h2>
        <TimeChart series={liftSeries} from={from} to={today} format={(n) => `${int(n)} kg`} empty="Ta courbe démarre avec ta première série lourde." />
      </section>

      <section className="card">
        <h2>Poids</h2>
        <TimeChart
          series={[
            { id: 'raw', label: 'Pesées', color: 'var(--ink-3)', points: weights.map((w) => ({ date: w.date, y: w.weight })), kind: 'dots' },
            { id: 'trend', label: 'Tendance', color: 'var(--mint)', points: ewma(weights).map((t) => ({ date: t.date, y: t.value })) },
          ]}
          from={from}
          to={today}
          format={(n) => `${fr1(n)} kg`}
          empty="Ta courbe apparaît après ta première pesée."
        />
      </section>

      <section className="card">
        <h2>Sommeil</h2>
        <TimeChart
          series={[
            { id: 'night', label: 'Nuit', color: 'rgba(143,176,255,.42)', points: sleep, kind: 'bars' },
            { id: 'avg', label: 'Moyenne 7 jours', color: 'var(--sky)', points: mean7(sleep) },
          ]}
          from={from}
          to={today}
          floor={0}
          format={(n) => hours(Math.round(n * 2) / 2)}
          empty="Réponds au point du matin pour voir ton sommeil."
        />
      </section>

      <section className="card">
        <h2>Forme du matin</h2>
        <TimeChart series={[{ id: 'rec', label: 'Forme', color: 'var(--mint)', points: series('recovery') }]} from={from} to={today} floor={0} format={(n) => `${fr1(n)}/10`} empty="Ta note du matin s'affichera ici." />
      </section>

      <section className="card">
        <h2>Calories</h2>
        <TimeChart series={[{ id: 'kcal', label: 'Calories', color: 'var(--mint)', points: series('kcal') }]} from={from} to={today} format={(n) => `${int(n)} kcal`} reference={{ y: p.maintenance, label: 'maintien' }} empty="Tes calories apparaissent dès que Yazio les envoie." />
      </section>

      <section className="card">
        <h2>Pas</h2>
        <TimeChart series={[{ id: 'steps', label: 'Pas', color: 'rgba(255,196,107,.55)', points: series('steps'), kind: 'bars' }]} from={from} to={today} floor={0} format={(n) => int(n)} reference={{ y: 8000, label: '8 000' }} empty="Tes pas apparaissent dès que Yazio les envoie." />
      </section>

      <section className="card">
        <h2>Séries par muscle</h2>
        <p className="muted">Sur 7 jours. La zone claire est celle où un muscle progresse le mieux.</p>
        <VolumeBars volume={volume} />
      </section>

      <section className="card">
        <h2>Tes records</h2>
        {prs.length ? (
          <ul className="prs">
            {prs.map((b) => (
              <li key={b.date + b.lift + b.kind}>
                <span>
                  {b.kind === '1RM' ? 'Record' : 'Record estimé'} {LIFT_LABEL[b.lift]}
                  <small>
                    {shortDate(b.date)}
                    {b.recovery ? ', tu reviens à ton niveau' : ''}
                  </small>
                </span>
                <b className="num">{kg(Math.round(b.value * 2) / 2)} kg</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Tes records arriveront ici.</p>
        )}
      </section>
    </div>
  );
}
