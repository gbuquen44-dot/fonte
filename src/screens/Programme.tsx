import React, { useMemo, useState } from 'react';
import { activeSession, beginSession, doneSessions, useApp } from '../state/store';
import { DAY_LABEL, dayKey, shortDate, type ISODate } from '../core/dates';
import { buildSession, estimateMinutes, hardSets, locate, planRows, SESSION_KEYS, weekDates, type PlanRow } from '../core/program';
import { effortText, plural, repsText, SET_LABEL } from '../core/labels';
import { lastBest } from '../core/session';
import type { LiftKey, PlannedExercise, PlannedSession, SessionKey, SessionLog } from '../core/types';
import { EXERCISES } from '../data/exercises';
import { kg, Segmented } from '../ui/controls';
import { IconCheck, IconChevron } from '../ui/icons';
import { useToday } from '../ui/hooks';
import { prepareAudio } from '../ui/sound';
import { sameSession } from './Today';


function minutes(sec: number) {
  const m = Math.round((sec / 60) * 2) / 2;
  return `${String(m).replace('.', ',')} min`;
}

export function Programme({ onSession }: { onSession(): void }) {
  const data = useApp((r) => r.data);
  const p = data.profile!;
  const today = useToday();
  const sessions = useMemo(() => doneSessions(data), [data.sessions]);
  const here = locate(today, p.programStart, p.moves);
  const [block, setBlock] = useState(here?.block ?? 1);
  const [week, setWeek] = useState(here?.blockWeek ?? 1);
  const [open, setOpen] = useState<SessionKey | null>(here?.key ?? 'mon');
  const [legend, setLegend] = useState(false);
  const active = activeSession(data);
  const days = weekDates(p.programStart, block, week).map((date) => ({ date, key: locate(date, p.programStart, p.moves)?.key ?? null }));
  const skipped = SESSION_KEYS.filter((k) => !days.some((d) => d.key === k));

  return (
    <div className="screen">
      <header className="head">
        <div>
          <p>6 séances, jeudi off</p>
          <h1>Programme</h1>
        </div>
      </header>

      <div className="block-nav">
        <button type="button" className="round" disabled={block <= 1} onClick={() => setBlock(block - 1)} aria-label="Bloc précédent">
          <span className="flip">
            <IconChevron size={18} />
          </span>
        </button>
        <strong>Bloc {block}</strong>
        <button type="button" className="round" onClick={() => setBlock(block + 1)} aria-label="Bloc suivant">
          <IconChevron size={18} />
        </button>
      </div>
      <Segmented<number> label="Semaine" value={week} onPick={setWeek} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `S${n}` }))} />

      <button type="button" className="legend-toggle" aria-expanded={legend} onClick={() => setLegend(!legend)}>
        Comment lire le programme
      </button>
      {legend ? <Legend /> : null}

      <ol className="days">
        {days.map(({ date, key }) => {
          if (!key) {
            return (
              <li key={date} className="day-off">
                <span>{DAY_LABEL[dayKey(date)]}</span>
                <span>{shortDate(date)} · Repos</span>
              </li>
            );
          }
          const plan = buildSession(block, week, key);
          return (
            <DayCard
              key={key}
              plan={plan}
              date={date}
              isToday={date === today}
              done={sameSession(sessions, plan)}
              open={open === key}
              onToggle={() => setOpen(open === key ? null : key)}
              tm={p.tm}
              history={sessions}
              busy={!!active}
              onStart={() => {
                prepareAudio();
                beginSession(plan, today);
                onSession();
              }}
            />
          );
        })}
        {skipped.map((key) => (
          <li key={key} className="day-off">
            <span>{buildSession(block, week, key).title}</span>
            <span>Pas cette semaine</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DayCard({ plan, date, isToday, done, open, onToggle, tm, history, busy, onStart }: { plan: PlannedSession; date: ISODate; isToday: boolean; done?: SessionLog; open: boolean; onToggle(): void; tm: Record<LiftKey, number>; history: SessionLog[]; busy: boolean; onStart(): void }) {
  return (
    <li className={`card daycard${open ? ' open' : ''}${isToday ? ' today' : ''}`}>
      <button type="button" className="daycard-head" aria-expanded={open} onClick={onToggle}>
        <span className="daycard-day">
          <small>
            {DAY_LABEL[dayKey(date)]} {shortDate(date)}
            {isToday ? ' · Aujourd\'hui' : ''}
          </small>
          <strong>{plan.title}</strong>
          <small className="num">
            {plan.exercises.length} {plural(plan.exercises.length, 'exercice')} · {hardSets(plan)} séries · {estimateMinutes(plan)} min
          </small>
        </span>
        {done ? (
          <span className="daycard-done">
            <IconCheck size={16} />
          </span>
        ) : (
          <span className="daycard-chevron">
            <IconChevron size={18} />
          </span>
        )}
      </button>
      {open ? (
        <div className="daycard-body">
          {plan.subtitle ? <p className="daycard-sub">{plan.subtitle}</p> : null}
          {blocks(plan.exercises).map((b, i) =>
            b.length > 1 ? <Superset key={i} members={b} tm={tm} history={history} /> : <ExerciseRows key={i} e={b[0]} tm={tm} history={history} />,
          )}
          {!done && !busy ? (
            <button type="button" className={`btn ${isToday ? 'primary big' : 'ghost'}`} onClick={onStart}>
              {isToday ? 'Lancer la séance' : 'Lancer cette séance'}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function rowText(r: PlanRow) {
  return `${r.count} × ${repsText(r.reps, r.repsMax, r.max)}`;
}

/** The exercises in order, each superset as one block. */
function blocks(list: PlannedExercise[]): PlannedExercise[][] {
  const out: PlannedExercise[][] = [];
  for (const e of list) {
    const prev = out[out.length - 1];
    if (e.group && prev?.[0].group === e.group) prev.push(e);
    else out.push([e]);
  }
  return out;
}

function rowsOf(e: PlannedExercise, tm: Record<LiftKey, number>, history: SessionLog[]) {
  const rows = planRows(e, tm);
  const accessory = rows.every((r) => r.type === 'acc');
  const last = accessory ? lastBest(e.exId, history) : undefined;
  const heavy = rows.find((r) => r.type === 'top' || r.type === 'test') ?? rows.find((r) => r.type === 'work' || r.type === 'acc');
  const effort = accessory && heavy?.rpe !== undefined ? effortText(heavy.rpe) : undefined;
  const loadText = (r: PlanRow) => (r.load !== undefined ? `${kg(r.load)} kg` : last ? `${kg(last.load)} kg` : 'Charge à trouver');
  return { rows, accessory, effort, loadText };
}

function ExerciseRows({ e, tm, history }: { e: PlannedExercise; tm: Record<LiftKey, number>; history: SessionLog[] }) {
  const def = EXERCISES[e.exId];
  const { rows, accessory, effort, loadText } = rowsOf(e, tm, history);
  return (
    <section className="ex">
      <h3>{def?.name ?? e.exId}</h3>
      <table>
        <tbody>
          {rows.map((r, i) => (
            <React.Fragment key={i}>
              <tr data-type={r.type}>
                {accessory ? null : <th scope="row">{SET_LABEL[r.type]}</th>}
                <td className="num strong">{rowText(r)}</td>
                <td className="num">{loadText(r)}</td>
              </tr>
              {!accessory && r.rpe !== undefined ? (
                <tr className="ex-effort">
                  <td colSpan={3}>{effortText(r.rpe)}</td>
                </tr>
              ) : null}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      <p className="ex-foot">
        {effort ? `Sur chaque série : ${effort}. ` : ''}Repos {def ? minutes(def.rest) : ''}.
      </p>
      {e.note ? <p className="ex-foot">{e.note}</p> : null}
    </section>
  );
}

/** A superset shown once: one line per exercise, the rest after the last one. */
function Superset({ members, tm, history }: { members: PlannedExercise[]; tm: Record<LiftKey, number>; history: SessionLog[] }) {
  const views = members.map((e) => rowsOf(e, tm, history));
  if (views.some((v) => v.rows.length !== 1 || !v.accessory)) {
    return (
      <>
        {members.map((e) => (
          <ExerciseRows key={e.exId} e={e} tm={tm} history={history} />
        ))}
      </>
    );
  }
  const efforts = [...new Set(views.map((v) => v.effort))];
  const last = EXERCISES[members[members.length - 1].exId];
  return (
    <section className="ex ex-pair">
      <h3>Superset</h3>
      <p className="ex-tag">Une série de chaque, à la suite, puis repos.</p>
      <table>
        <tbody>
          {members.map((e, i) => (
            <tr key={e.exId}>
              <th scope="row">{EXERCISES[e.exId]?.name ?? e.exId}</th>
              <td className="num strong">{rowText(views[i].rows[0])}</td>
              <td className="num">{views[i].loadText(views[i].rows[0])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ex-foot">
        {efforts.length === 1 && efforts[0] ? `Sur chaque série : ${efforts[0]}. ` : ''}Repos {last ? minutes(last.rest) : ''} après les deux.
      </p>
      {members.map((e) => (e.note ? <p key={e.exId} className="ex-foot">{e.note}</p> : null))}
    </section>
  );
}

function Legend() {
  return (
    <dl className="card legend">
      <div>
        <dt>2 × 5</dt>
        <dd>2 séries de 5 répétitions.</dd>
      </div>
      <div>
        <dt>Montée</dt>
        <dd>Séries pour arriver à ta charge lourde. Elles ne doivent pas être dures.</dd>
      </div>
      <div>
        <dt>Série lourde</dt>
        <dd>La plus lourde de l'exercice. Elle sert aussi à voir ta forme du jour.</dd>
      </div>
      <div>
        <dt>Travail</dt>
        <dd>Les séries qui font progresser. Plus légères, mais plus de reps.</dd>
      </div>
      <div>
        <dt>Il reste 2 reps</dt>
        <dd>À la fin de la série, tu aurais pu en faire 2 de plus. C'est le RPE 8.</dd>
      </div>
      <div>
        <dt>Bloc</dt>
        <dd>5 semaines. La semaine 5 est allégée, avec un single lourd pour chaque mouvement.</dd>
      </div>
    </dl>
  );
}
