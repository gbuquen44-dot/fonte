import React, { useMemo, useState } from 'react';
import { doneSessions, useApp } from '../state/store';
import { addDays, dateRange, diffDays, shortDate, type ISODate } from '../core/dates';
import { weighIns } from '../core/energy';
import { currentE1rm, e1rmSeries, LIFT_LABEL, LIFTS, liftTrend, rolling3 } from '../core/lifting';
import { loggedVolume } from '../core/volume';
import { rollingMean } from '../core/weight';
import type { LiftKey, PRBadge, SessionLog } from '../core/types';
import { TimeChart, VolumeBars, type Pt } from '../ui/Chart';
import { dayPlan, MUSCU_KEYS, MUSCU_START } from '../core/program';
import { bestSets, mainOf, PRIORITY, progressOf, type ExerciseProgress } from '../core/progress';
import { EXERCISES, MUSCLE_LABEL } from '../data/exercises';
import { fr1, hours, int, kg, Segmented } from '../ui/controls';
import { IconChevron } from '../ui/icons';
import { useStored, useToday } from '../ui/hooks';
import { WeightSheet } from './Weight';
import { CardHead } from '../ui/CardHead';
import { GlyphBolt, GlyphBowl, GlyphChart, GlyphHeart, GlyphLayers, GlyphMoon, GlyphScale, GlyphSteps, GlyphTrophy } from '../ui/glyphs';

const COLORS: Record<LiftKey, string> = { squat: 'var(--c-squat)', bench: 'var(--c-bench)', deadlift: 'var(--c-dead)' };

export function Progress() {
  const data = useApp((r) => r.data);
  const p = data.profile!;
  const today = useToday();
  const [range, setRange] = useState(30);
  const [weightOpen, setWeightOpen] = useState(false);
  const [trendDays, setTrendDays] = useStored('fonte.trendDays', 5);
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
  const [scope, setScope] = useState<'prio' | 'all'>('prio');
  const [open, setOpen] = useState<string | null>(null);
  const exercises = useMemo(() => {
    const ids = [...new Set(MUSCU_KEYS.flatMap((k) => dayPlan(k, p.muscu).slots.map((x) => x.exId)))];
    const rank = (id: string) => {
      const i = PRIORITY.indexOf(mainOf(id) ?? 'abdos');
      return i < 0 ? PRIORITY.length : i;
    };
    return ids.sort((a, b) => rank(a) - rank(b)).map((id) => progressOf(sessions, id, MUSCU_START));
  }, [sessions, p.muscu]);
  const shown = scope === 'prio' ? exercises.filter((e) => PRIORITY.includes(mainOf(e.exId) ?? 'abdos')) : exercises;
  const ups = exercises.filter((e) => e.move === 'up').length;
  const tracked = exercises.filter((e) => e.move !== 'new').length;
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

  return (
    <div className="screen">
      <header className="head">
        <div>
          <p>Phase muscu, depuis le 23 novembre</p>
          <h1>Progrès</h1>
        </div>
      </header>

      <section className="card">
        <CardHead glyph={GlyphChart} tone="salle" title="Tes exercices" />
        <p className="muted">
          {tracked ? `${ups} sur ${tracked} en progrès depuis le début de la phase. ` : ''}Ta meilleure série de la dernière séance, comparée à la première.
        </p>
        <div className="prog-scope">
          <Segmented<'prio' | 'all'> label="Exercices affichés" value={scope} onPick={setScope} options={[{ value: 'prio', label: 'Tes priorités' }, { value: 'all', label: 'Tous' }]} />
        </div>
        <ul className="prog-list">
          {shown.map((e) => (
            <ExerciseRow key={e.exId} e={e} open={open === e.exId} onToggle={() => setOpen(open === e.exId ? null : e.exId)} sessions={sessions} today={today} />
          ))}
        </ul>
      </section>

      <section className="card">
        <CardHead glyph={GlyphLayers} tone="biz" title="Séries par muscle" />
        <p className="muted">Sur 7 jours. La zone claire est celle où un muscle progresse le mieux.</p>
        <VolumeBars volume={volume} />
      </section>

      <Segmented<number> label="Période" value={range} onPick={setRange} options={[{ value: 30, label: '30 jours' }, { value: 90, label: '90 jours' }, { value: 365, label: '1 an' }]} />

      <h2 className="prog-sub">Squat, bench, deadlift</h2>
      <ul className="lifts">
        {LIFTS.map((l) => {
          const t = liftTrend(sessions, l);
          const now = currentE1rm(sessions, l, p.tm[l]);
          return (
            <li key={l} className="card" style={{ '--c': COLORS[l] } as React.CSSProperties}>
              <span>{LIFT_LABEL[l]}</span>
              <b className="num">{kg(Math.round(now * 2) / 2)}</b>
              <small>max estimé</small>
              {t?.verdict === 'probable' ? <small className="up">en progrès</small> : null}
            </li>
          );
        })}
      </ul>

      <section className="card">
        <CardHead glyph={GlyphBolt} tone="perso" title="Force" />
        <TimeChart series={liftSeries} from={from} to={today} format={(n) => `${int(n)} kg`} empty="Ta courbe démarre avec ta première série lourde." />
      </section>

      <section className="card">
        <CardHead glyph={GlyphScale} tone="salle" title="Poids">
          <button type="button" className="card-more" onClick={() => setWeightOpen(true)}>
            Détail <IconChevron size={16} />
          </button>
        </CardHead>
        <TimeChart
          series={[
            { id: 'raw', label: 'Pesées', color: 'var(--ink-3)', points: weights.map((w) => ({ date: w.date, y: w.weight })), kind: 'dots' },
            { id: 'trend', label: `Moyenne ${trendDays} jours`, color: 'var(--salle)', points: rollingMean(weights, trendDays).map((t) => ({ date: t.date, y: t.value })) },
          ]}
          from={from}
          to={today}
          format={(n) => `${fr1(n)} kg`}
          empty="Ta courbe apparaît après ta première pesée."
        />
      </section>
      <WeightSheet open={weightOpen} onClose={() => setWeightOpen(false)} days={trendDays} onDays={setTrendDays} />

      <section className="card">
        <CardHead glyph={GlyphMoon} tone="ecole" title="Sommeil" />
        <TimeChart
          series={[
            { id: 'night', label: 'Nuit', color: 'rgba(125,156,212,.38)', points: sleep, kind: 'bars' },
            { id: 'avg', label: 'Moyenne 7 jours', color: 'var(--ecole)', points: mean7(sleep) },
          ]}
          from={from}
          to={today}
          floor={0}
          format={(n) => hours(Math.round(n * 2) / 2)}
          empty="Réponds au point du matin pour voir ton sommeil."
        />
      </section>

      <section className="card">
        <CardHead glyph={GlyphHeart} tone="biz" title="Forme du matin" />
        <TimeChart series={[{ id: 'rec', label: 'Forme', color: 'var(--mint)', points: series('recovery') }]} from={from} to={today} floor={0} format={(n) => `${fr1(n)}/10`} empty="Ta note du matin s'affichera ici." />
      </section>

      <section className="card">
        <CardHead glyph={GlyphBowl} tone="perso" title="Calories" />
        <TimeChart series={[{ id: 'kcal', label: 'Calories', color: 'var(--perso)', points: series('kcal') }]} from={from} to={today} format={(n) => `${int(n)} kcal`} reference={{ y: p.maintenance, label: 'maintien' }} empty="Tes calories apparaissent dès que Yazio les envoie." />
      </section>

      <section className="card">
        <CardHead glyph={GlyphSteps} tone="ecole" title="Pas" />
        <TimeChart series={[{ id: 'steps', label: 'Pas', color: 'rgba(125,156,212,.5)', points: series('steps'), kind: 'bars' }]} from={from} to={today} floor={0} format={(n) => int(n)} reference={{ y: 8000, label: '8 000' }} empty="Tes pas apparaissent dès que Yazio les envoie." />
      </section>


      <section className="card">
        <CardHead glyph={GlyphTrophy} tone="perso" title="Tes records" />
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

function ExerciseRow({ e, open, onToggle, sessions, today }: { e: ExerciseProgress; open: boolean; onToggle(): void; sessions: SessionLog[]; today: ISODate }) {
  const name = EXERCISES[e.exId]?.name ?? e.exId;
  const muscle = mainOf(e.exId);
  const points = useMemo(() => (open ? bestSets(sessions, e.exId).map((b) => ({ date: b.date, y: b.load })) : []), [open, sessions, e.exId]);
  return (
    <li className={`prog-row${open ? ' open' : ''}`}>
      <button type="button" aria-expanded={open} onClick={onToggle}>
        <span className="prog-name">
          <strong>{name}</strong>
          <small>
            {muscle ? MUSCLE_LABEL[muscle] : ''}
            {e.last ? (e.last.load ? ` · ${kg(e.last.load)} kg × ${e.last.reps}` : ` · ${e.last.reps} reps`) : ''}
          </small>
        </span>
        <span className="prog-delta num" data-move={e.move}>
          {e.delta}
        </span>
      </button>
      {open ? (
        <div className="prog-chart">
          <TimeChart
            series={[{ id: e.exId, label: 'Charge de ta meilleure série', color: 'var(--salle)', points }]}
            from={addDays(today, -120)}
            to={today}
            height={140}
            format={(n) => `${kg(n)} kg`}
            empty="La courbe démarre à ta première série."
          />
        </div>
      ) : null}
    </li>
  );
}
