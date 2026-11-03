import React, { useEffect, useMemo, useRef, useState } from 'react';
import { deleteSession, doneSessions, flush, isStale, saveSession, updateProfile, useApp } from '../state/store';
import type { EquipKind, LiftKey, PlannedSet, PostCheck, PreCheck, SessionLog } from '../core/types';
import {
  addSet,
  applyAdjust,
  currentStep,
  durationMin,
  finishSession,
  isDone,
  logSet,
  needsEffort,
  peekNext,
  prefill,
  progress,
  readForm,
  replaceExercise,
  restFor,
  skipExercise,
  undoLast,
  warmupLadder,
  type FormRead,
  type Step,
} from '../core/session';
import { detectPRs, e1rm, LIFT_LABEL, platesPerSide, tonnage } from '../core/lifting';
import { SET_LABEL, plural, repsText, rirText } from '../core/labels';
import { CUES, EXERCISES, REPLACEMENTS } from '../data/exercises';
import { Choice, int, Keypad, kg, MultiChoice, Sheet, SheetHead } from '../ui/controls';
import { IconCheck, IconClose, IconDown, IconList, IconMore, IconPlus, IconSkip, IconSwap, IconUndo } from '../ui/icons';
import { loadValues, rowHeight, Wheel } from '../ui/Wheel';
import { beep, haptic, prepareAudio, success } from '../ui/sound';

const MAX_LOAD: Record<EquipKind, number> = { barbell: 320, smith: 260, machine: 300, cable: 160, dumbbell: 80, bodyweight: 100 };
const REPS = Array.from({ length: 31 }, (_, i) => i);
const LEFT = [0, 1, 2, 3, 4, 5];
const repsFormat = (n: number) => String(n);

function clock(ms: number) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function useNow(active: boolean, every = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [active, every]);
  return now;
}

function useWakeLock() {
  useEffect(() => {
    let lock: { release(): Promise<void> } | undefined;
    const ask = async () => {
      try {
        lock = await (navigator as unknown as { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen');
      } catch {
        lock = undefined;
      }
    };
    void ask();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void ask();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}

export function SessionScreen({ onClose }: { onClose(): void }) {
  const sessions = useApp((r) => r.data.sessions);
  const profile = useApp((r) => r.data.profile);
  const s = useMemo(() => Object.values(sessions).find((x) => x.status === 'active'), [sessions]);
  useWakeLock();
  if (!s || !profile) return null;
  return <Running key={s.id} s={s} onClose={onClose} />;
}

interface Note {
  text?: string;
  form?: FormRead;
  exId?: string;
}

function Running({ s, onClose }: { s: SessionLog; onClose(): void }) {
  const data = useApp((r) => r.data);
  const profile = data.profile!;
  const history = useMemo(() => doneSessions(data), [data.sessions]);
  const [editing, setEditing] = useState<Step | null>(null);
  const [menu, setMenu] = useState(false);
  const [overview, setOverview] = useState(false);
  const [ending, setEnding] = useState(() => isStale(s));
  const [note, setNote] = useState<Note>({});
  const [flash, setFlash] = useState(0);
  const resting = !!s.restUntil;
  const now = useNow(true, resting ? 200 : 15_000);
  const step = currentStep(s);
  const active = editing ?? step;
  const restLeft = s.restUntil ? s.restUntil - now : 0;
  const ended = useRef(0);
  const lastTap = useRef(0);

  useEffect(() => {
    if (s.restUntil && restLeft <= 0 && ended.current !== s.restUntil) {
      ended.current = s.restUntil;
      if (restLeft > -3000) beep();
      saveSession({ ...s, restUntil: undefined, restTotal: undefined, updatedAt: Date.now() });
    }
  }, [restLeft, s]);

  function validate(st: Step, entry: { load: number; reps: number; rpe?: number }) {
    const t = Date.now();
    const wasEditing = !!editing;
    if (!wasEditing && t - lastTap.current < 700) return;
    lastTap.current = t;
    prepareAudio();
    haptic();
    let next = logSet(s, st, entry, t);
    setEditing(null);
    if (wasEditing) {
      saveSession(next);
      return;
    }
    success();
    setFlash((f) => f + 1);
    const nextStep = currentStep(next);
    const rest = nextStep ? restFor(next, st, nextStep) : 0;
    next = rest > 0 ? { ...next, restUntil: t + rest * 1000, restTotal: rest } : { ...next, restUntil: undefined, restTotal: undefined };
    saveSession(next);

    const exId = s.plan[st.ex].exId;
    const def = EXERCISES[exId];
    const form = entry.rpe !== undefined ? readForm(s, st, entry.rpe, history) ?? undefined : undefined;
    const est = def?.lift ? e1rm(entry.load, entry.reps, entry.rpe) : null;
    let text: string | undefined;
    if (est && def?.lift) {
      const value = Math.round(est.value * 2) / 2;
      text = est.value > profile.best[def.lift] ? `Max estimé ${kg(value)} kg, au-dessus de ton meilleur` : `Max estimé ${kg(value)} kg`;
    }
    setNote({ text, form: form && form.level !== 'keep' ? form : undefined, exId });
  }

  const { done, total } = progress(s);
  const showFinish = ending || (!step && !editing);

  return (
    <div className="session" data-resting={resting ? 'true' : undefined}>
      <header className="s-top">
        <button type="button" className="round" onClick={onClose} aria-label="Réduire la séance">
          <IconDown size={20} />
        </button>
        <div className="s-progress" role="progressbar" aria-valuenow={done} aria-valuemax={total} aria-label="Progression de la séance">
          <span className="num">
            {done} / {total} {plural(total, 'série')}
          </span>
          <i>
            <b style={{ transform: `scaleX(${total ? done / total : 0})` }} />
          </i>
        </div>
        <button type="button" className="round" onClick={() => setOverview(true)} aria-label="Voir toute la séance">
          <IconList size={20} />
        </button>
        <button type="button" className="round" onClick={() => setMenu(true)} aria-label="Options de la séance">
          <IconMore size={20} />
        </button>
      </header>

      {showFinish ? (
        <Finish s={s} history={history} onBack={step ? () => setEnding(false) : undefined} onClose={onClose} />
      ) : (
        <>
          <div className="s-hero">
            <ExerciseMap s={s} current={active?.ex ?? 0} />
            {resting && restLeft > 0 ? (
              <RestRing
                left={restLeft}
                total={(s.restTotal ?? 1) * 1000}
                text={note.text}
                onShift={(d) => saveSession({ ...s, restUntil: (s.restUntil ?? 0) + d * 1000, restTotal: Math.max(1, (s.restTotal ?? 0) + d), updatedAt: Date.now() })}
                onSkip={() => saveSession({ ...s, restUntil: undefined, restTotal: undefined, updatedAt: Date.now() })}
              />
            ) : active ? (
              <Guide s={s} st={active} history={history} tm={profile.tm} />
            ) : null}
            {note.form && note.exId ? (
              <div className="s-form">
                <p>{note.form.message}</p>
                <div>
                  <button type="button" className="btn ghost small" onClick={() => setNote({ text: note.text })}>
                    Garder le plan
                  </button>
                  <button
                    type="button"
                    className="btn primary small"
                    onClick={() => {
                      saveSession(applyAdjust(s, note.exId as string, note.form!.multiplier, Date.now()));
                      setNote({ text: 'Charges ajustées pour la suite.' });
                    }}
                  >
                    Alléger
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          {active ? (
            <SetCard key={s.plan[active.ex].sets[active.set].id + (editing ? '-e' : '')} s={s} st={active} editing={!!editing} tm={profile.tm} history={history} flash={flash} onValidate={validate} onCancelEdit={() => setEditing(null)} onEdit={setEditing} />
          ) : null}
        </>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} label="Options de la séance">
        <SessionMenu s={s} step={active} onClose={() => setMenu(false)} onEnd={() => { setMenu(false); setEditing(null); setEnding(true); }} onAbandon={() => { deleteSession(s.id); onClose(); }} />
      </Sheet>
      <Sheet open={overview} onClose={() => setOverview(false)} label="Toute la séance" full>
        <SheetHead title={s.title} onClose={() => setOverview(false)} />
        <Overview s={s} current={active?.ex} onEdit={(st) => { setEditing(st); setOverview(false); }} />
      </Sheet>
    </div>
  );
}

function ExerciseMap({ s, current }: { s: SessionLog; current: number }) {
  const box = useRef<HTMLOListElement>(null);
  useEffect(() => {
    box.current?.querySelector('[data-now]')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [current]);
  return (
    <ol className="s-map" ref={box} aria-label="Exercices de la séance">
      {s.plan.map((e, i) => {
        const finished = e.sets.every((x) => isDone(s, x.id) || s.skipped.includes(x.id));
        return (
          <li key={`${e.exId}-${i}`} data-now={i === current ? 'true' : undefined} data-done={finished ? 'true' : undefined}>
            {finished ? <IconCheck size={14} /> : null}
            {EXERCISES[e.exId]?.name ?? e.exId}
          </li>
        );
      })}
    </ol>
  );
}

function Guide({ s, st, history, tm }: { s: SessionLog; st: Step; history: SessionLog[]; tm: Record<LiftKey, number> }) {
  const ex = s.plan[st.ex];
  const p = ex.sets[st.set];
  const def = EXERCISES[ex.exId];
  const init = useMemo(() => prefill(s, st, tm, history), [p.id, s.adjust[ex.exId]]);
  const isBar = def?.kind === 'barbell';
  const first = st.set === 0 && !s.sets.some((x) => x.exId === ex.exId);
  const warm = isBar && (def?.lift || def?.tm) && first && p.pct !== undefined ? warmupLadder(init.load) : null;
  const next = peekNext(s, st);
  const nextName = next && next.ex !== st.ex ? EXERCISES[s.plan[next.ex].exId]?.name : undefined;
  const adjusted = (s.adjust[ex.exId] ?? 1) < 1 && p.type !== 'ramp';
  const lines = [ex.note, first ? CUES[ex.exId] : undefined, init.hint, adjusted ? 'Charge allégée pour aujourd\'hui.' : undefined].filter(Boolean) as string[];
  return (
    <div className="s-guide">
      {warm ? (
        <div className="s-warm">
          <b>Échauffe-toi d'abord</b>
          <span className="num">{warm.map((w) => `${kg(w.load)} × ${w.reps}`).join('   ·   ')}</span>
        </div>
      ) : null}
      {lines.slice(0, 2).map((l) => (
        <p key={l}>{l}</p>
      ))}
      {nextName ? <p className="s-next">Après cette série : {nextName}</p> : null}
    </div>
  );
}

function RestRing({ left, total, text, onShift, onSkip }: { left: number; total: number; text?: string; onShift(d: number): void; onSkip(): void }) {
  const size = window.innerHeight < 720 ? 104 : 164;
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const ratio = Math.min(1, Math.max(0, left / total));
  return (
    <div className="s-rest">
      <div className="s-rest-main">
        <button type="button" className="s-shift" onClick={() => onShift(-30)} aria-label="30 secondes de moins">
          −30
        </button>
        <div className="s-ring" style={{ width: size, height: size }} role="timer" aria-label="Temps de repos restant">
          <svg width={size} height={size} aria-hidden="true">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="9" />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--mint)" strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="s-ring-value" />
          </svg>
          <span>
            <b className="num">{clock(left)}</b>
            <small>repos</small>
          </span>
        </div>
        <button type="button" className="s-shift" onClick={() => onShift(30)} aria-label="30 secondes de plus">
          +30
        </button>
      </div>
      {text ? <p>{text}</p> : null}
      <button type="button" className="s-skip" onClick={onSkip}>
        Passer le repos
      </button>
    </div>
  );
}

function SetCard({
  s,
  st,
  editing,
  tm,
  history,
  flash,
  onValidate,
  onCancelEdit,
  onEdit,
}: {
  s: SessionLog;
  st: Step;
  editing: boolean;
  tm: Record<LiftKey, number>;
  history: SessionLog[];
  flash: number;
  onValidate(st: Step, e: { load: number; reps: number; rpe?: number }): void;
  onCancelEdit(): void;
  onEdit(st: Step): void;
}) {
  const ex = s.plan[st.ex];
  const p = ex.sets[st.set];
  const def = EXERCISES[ex.exId];
  const logged = s.sets.find((x) => x.plannedId === p.id);
  const init = useMemo(() => prefill(s, st, tm, history), [p.id, s.adjust[ex.exId]]);
  const [load, setLoad] = useState(logged?.load ?? init.load);
  const [reps, setReps] = useState(logged?.reps ?? init.reps);
  const [rpe, setRpe] = useState<number | undefined>(logged?.rpe ?? p.rpe);
  const [pad, setPad] = useState<'load' | 'reps' | null>(null);
  const kind = def?.kind ?? 'machine';
  const step = def?.step ?? 2.5;
  const offGrid = Math.abs(load / step - Math.round(load / step)) > 1e-6 || load > MAX_LOAD[kind] ? load : null;
  const grid = useMemo(() => loadValues(step, MAX_LOAD[kind], offGrid ?? 0), [step, kind, offGrid]);
  const row = useMemo(rowHeight, []);
  const lift = !!def?.lift;
  const effort = needsEffort(p, lift);

  useEffect(() => {
    if (!logged) setLoad(init.load);
  }, [init.load]);

  const body = kind === 'bodyweight';
  const plates = kind === 'barbell' && load >= 20 ? platesPerSide(load) : null;
  const typeLabel = SET_LABEL[p.type];
  const target = p.max ? 'le max de reps' : `${repsText(p.reps, p.repsMax)} ${plural(p.repsMax ?? p.reps, 'rep')}`;
  const others = ex.sets.length;

  return (
    <aside className="setcard" aria-label="Série en cours">
      <div className="setcard-head">
        <div>
          <h2>{def?.name ?? ex.exId}</h2>
          <p>
            Série {st.set + 1} sur {others}
            {typeLabel ? ` · ${typeLabel}` : ''}
            {ex.group ? ' · Superset' : ''}
          </p>
        </div>
        {editing ? (
          <button type="button" className="round" onClick={onCancelEdit} aria-label="Annuler la modification">
            <IconClose size={18} />
          </button>
        ) : null}
      </div>

      <ol className="setdots" aria-label="Séries de l'exercice">
        {ex.sets.map((x, i) => {
          const log = s.sets.find((y) => y.plannedId === x.id);
          const state = i === st.set ? 'now' : log ? (log.failed ? 'failed' : 'done') : s.skipped.includes(x.id) ? 'skip' : 'todo';
          return (
            <li key={x.id}>
              <button type="button" data-state={state} disabled={!log || i === st.set} onClick={() => onEdit({ ex: st.ex, set: i })}>
                {log ? (
                  <span className="num">
                    {body && !log.load ? '' : `${kg(log.load)}×`}
                    {log.reps}
                  </span>
                ) : (
                  <i />
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <p className="setcard-goal">
        Objectif <b className="num">{target}</b>
        {p.rpe !== undefined && p.type !== 'ramp' ? <span> · {rirText(p.rpe)}</span> : null}
      </p>

      <div className="wheels">
        <Wheel label={body ? 'Lest (kg)' : 'Kilos'} values={grid} value={load} onChange={setLoad} format={kg} onEdit={() => setPad('load')} row={row} />
        <Wheel label="Reps" values={REPS} value={reps} onChange={setReps} format={repsFormat} onEdit={() => setPad('reps')} row={row} />
      </div>

      {plates && plates.plates.length ? <p className="setcard-plates num">Par côté : {plates.plates.map(kg).join(' + ')}</p> : plates ? <p className="setcard-plates">Barre seule</p> : null}

      {effort ? (
        <div className="effort" role="radiogroup" aria-label="Reps en réserve">
          <span>Reps en réserve</span>
          <div>
            {LEFT.map((n) => {
              const on = rpe !== undefined && Math.min(5, Math.round(10 - rpe)) === n;
              return (
                <button key={n} type="button" role="radio" aria-checked={on} className={on ? 'on' : ''} onClick={() => setRpe(10 - n)}>
                  {n === 5 ? '5+' : n}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <button key={flash} type="button" className={`btn primary big${flash ? ' pulse' : ''}`} onClick={() => onValidate(st, { load, reps, rpe: effort ? rpe : undefined })}>
        <IconCheck size={22} /> {editing ? 'Enregistrer' : reps === 0 ? 'Série ratée' : 'Série faite'}
      </button>

      {pad ? (
        <Keypad
          title={pad === 'load' ? (def?.name ?? 'Charge') : 'Répétitions'}
          unit={pad === 'load' ? 'kg' : 'reps'}
          decimals={pad === 'load'}
          initial={pad === 'load' ? load : reps}
          onCancel={() => setPad(null)}
          onDone={(n) => {
            if (pad === 'load') setLoad(n);
            else setReps(Math.min(30, Math.round(n)));
            setPad(null);
          }}
        />
      ) : null}
    </aside>
  );
}

function Overview({ s, current, onEdit }: { s: SessionLog; current?: number; onEdit(st: Step): void }) {
  return (
    <div className="overview">
      {s.plan.map((e, i) => (
        <section key={`${e.exId}-${i}`} data-now={current === i ? 'true' : undefined}>
          <h3>{EXERCISES[e.exId]?.name ?? e.exId}</h3>
          <ul>
            {e.sets.map((p, j) => {
              const log = s.sets.find((x) => x.plannedId === p.id);
              const skipped = s.skipped.includes(p.id);
              return (
                <li key={p.id}>
                  <button type="button" disabled={!log} onClick={() => onEdit({ ex: i, set: j })}>
                    <span>{SET_LABEL[p.type] || `Série ${j + 1}`}</span>
                    <span className="num">{log ? (log.load ? `${kg(log.load)} kg × ${log.reps}` : `${log.reps} ${plural(log.reps, 'rep')}`) : skipped ? 'Passée' : <Planned p={p} />}</span>
                    {log ? <IconCheck size={16} /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

const Planned = ({ p }: { p: PlannedSet }) => <>{p.max ? 'max de reps' : `${repsText(p.reps, p.repsMax)} ${plural(p.repsMax ?? p.reps, 'rep')}`}</>;

function SessionMenu({ s, step, onClose, onEnd, onAbandon }: { s: SessionLog; step: Step | null; onClose(): void; onEnd(): void; onAbandon(): void }) {
  const [view, setView] = useState<'main' | 'swap' | 'abandon'>('main');
  const ex = step ? s.plan[step.ex] : null;
  const alts = ex ? (REPLACEMENTS[ex.exId] ?? []).filter((id) => EXERCISES[id]) : [];
  const name = ex ? EXERCISES[ex.exId]?.name : '';
  if (view === 'swap' && step) {
    return (
      <div className="menu">
        <h3>Remplacer {name}</h3>
        {alts.map((id) => (
          <button key={id} type="button" onClick={() => { saveSession(replaceExercise(s, step.ex, id, Date.now())); onClose(); }}>
            {EXERCISES[id].name}
          </button>
        ))}
      </div>
    );
  }
  if (view === 'abandon') {
    return (
      <div className="menu">
        <h3>Supprimer cette séance ?</h3>
        <p>
          {s.sets.length} {plural(s.sets.length, 'série notée', 'séries notées')} {plural(s.sets.length, 'sera perdue', 'seront perdues')}.
        </p>
        <button type="button" className="danger" onClick={onAbandon}>
          Supprimer la séance
        </button>
        <button type="button" onClick={() => setView('main')}>
          Garder
        </button>
      </div>
    );
  }
  return (
    <div className="menu">
      {s.sets.length ? (
        <button type="button" onClick={() => { saveSession(undoLast(s, Date.now())); onClose(); }}>
          <IconUndo size={20} /> Annuler la dernière série
        </button>
      ) : null}
      {step ? (
        <button type="button" onClick={() => { saveSession(addSet(s, step.ex, Date.now())); onClose(); }}>
          <IconPlus size={20} /> Ajouter une série
        </button>
      ) : null}
      {step && alts.length ? (
        <button type="button" onClick={() => setView('swap')}>
          <IconSwap size={20} /> Remplacer {name}
        </button>
      ) : null}
      {step ? (
        <button type="button" onClick={() => { saveSession(skipExercise(s, step.ex, Date.now())); onClose(); }}>
          <IconSkip size={20} /> Passer {name}
        </button>
      ) : null}
      <button type="button" onClick={onEnd}>
        <IconCheck size={20} /> Terminer la séance
      </button>
      <button type="button" className="danger" onClick={() => setView('abandon')}>
        <IconClose size={20} /> Supprimer la séance
      </button>
    </div>
  );
}

const PAIN_ZONES = ['Bas du dos', 'Épaule', 'Coude', 'Genou', 'Hanche', 'Poignet', 'Pectoral', 'Autre'];

function Finish({ s, history, onBack, onClose }: { s: SessionLog; history: SessionLog[]; onBack?(): void; onClose(): void }) {
  const profile = useApp((r) => r.data.profile)!;
  const usual = profile.usualMeal;
  const prs = useMemo(() => detectPRs(s.sets, history, profile.best, s.block), [s.sets, history, profile.best, s.block]);
  const [hard, setHard] = useState<number>();
  const [vsPlan, setVs] = useState<number>();
  const [meal, setMeal] = useState<'usual' | 'other'>(usual ? 'usual' : 'other');
  const [mealDelay, setDelay] = useState<PreCheck['mealDelay']>('1-2');
  const [carbs, setCarbs] = useState<PreCheck['carbs']>('mid');
  const [caffeineMg, setCaf] = useState(profile.usualCaffeineMg ?? 0);
  const [pain, setPain] = useState<'no' | 'yes'>('no');
  const [zone, setZone] = useState<string[]>([]);
  const [level, setLevel] = useState<number>();
  const [ready, setReady] = useState(false);
  const ok = hard !== undefined && vsPlan !== undefined && (pain === 'no' || (zone.length > 0 && level !== undefined));

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const finish = () => {
    const post: PostCheck = { srpe: hard as number, vsPlan: vsPlan as number, painZone: pain === 'yes' ? zone[0] : undefined, painLevel: pain === 'yes' ? level : undefined, unusual: [] };
    const pre: PreCheck = meal === 'usual' && usual ? { mealDelay: usual.mealDelay, carbs: usual.carbs, caffeineMg, food: usual.label, usual: true } : { mealDelay, carbs: mealDelay === 'fasted' ? 'low' : carbs, caffeineMg };
    const now = Date.now();
    // A session finished the next day ended at its last set, not now.
    saveSession({ ...finishSession(s, post, isStale(s, now) ? s.updatedAt : now, history, profile.best), pre: s.pre ?? pre, updatedAt: now });
    if (caffeineMg !== profile.usualCaffeineMg) updateProfile({ usualCaffeineMg: caffeineMg });
    void flush();
    onClose();
  };

  return (
    <div className={`finish${ready ? ' in' : ''}`}>
      <div className="finish-head">
        <span className="finish-check">
          <IconCheck size={30} />
        </span>
        <h1>Séance finie</h1>
        <p>{s.title}</p>
      </div>
      <dl className="finish-stats">
        <div>
          <dd className="num">{durationMin(s)}</dd>
          <dt>{plural(durationMin(s), 'minute')}</dt>
        </div>
        <div>
          <dd className="num">{s.sets.length}</dd>
          <dt>{plural(s.sets.length, 'série')}</dt>
        </div>
        <div>
          <dd className="num">{int(tonnage(s.sets))}</dd>
          <dt>kg soulevés</dt>
        </div>
      </dl>
      {prs.length ? (
        <ul className="finish-prs">
          {prs.map((p) => (
            <li key={p.lift + p.kind}>
              <strong>
                {p.kind === '1RM' ? 'Record' : 'Record estimé'} {LIFT_LABEL[p.lift]}
              </strong>
              <b className="num">{kg(Math.round(p.value * 2) / 2)} kg</b>
            </li>
          ))}
        </ul>
      ) : null}

      <section>
        <h2>Comment c'était ?</h2>
        <Choice<number> label="Dureté de la séance" columns={4} value={hard} onPick={setHard} options={[{ value: 3, label: 'Facile' }, { value: 5, label: 'Moyen' }, { value: 7, label: 'Dur' }, { value: 9, label: 'Très dur' }]} />
      </section>
      <section>
        <h2>Par rapport au plan ?</h2>
        <Choice<number> label="Par rapport au plan" columns={3} value={vsPlan} onPick={setVs} options={[{ value: 2, label: 'Moins bien' }, { value: 3, label: 'Comme prévu' }, { value: 4, label: 'Mieux' }]} />
      </section>
      <section>
        <h2>Avant la séance, tu as mangé ?</h2>
        {usual ? (
          <Choice<'usual' | 'other'> label="Repas" columns={2} value={meal} onPick={setMeal} options={[{ value: 'usual', label: 'Comme d\'hab', sub: usual.label }, { value: 'other', label: 'Autre chose' }]} />
        ) : null}
        {meal === 'other' ? (
          <div className="finish-more">
            <Choice<PreCheck['mealDelay']> label="Délai du dernier repas" columns={3} value={mealDelay} onPick={setDelay} options={[{ value: 'lt1', label: '− de 1 h' }, { value: '1-2', label: '1 à 2 h' }, { value: '2-3', label: '2 à 3 h' }, { value: '3-4', label: '3 à 4 h' }, { value: '4p', label: '+ de 4 h' }, { value: 'fasted', label: 'À jeun' }]} />
            {mealDelay !== 'fasted' ? <Choice<PreCheck['carbs']> label="Glucides" columns={3} value={carbs} onPick={setCarbs} options={[{ value: 'low', label: 'Peu de glucides' }, { value: 'mid', label: 'Moyen' }, { value: 'high', label: 'Beaucoup' }]} /> : null}
          </div>
        ) : null}
      </section>
      <section>
        <h2>Caféine ou pré-workout ?</h2>
        <Choice<number> label="Caféine" columns={4} value={caffeineMg} onPick={setCaf} options={[{ value: 0, label: 'Rien' }, { value: 100, label: '100 mg' }, { value: 200, label: '200 mg' }, { value: 300, label: '300 mg' }]} />
      </section>
      <section>
        <h2>Une douleur ?</h2>
        <Choice<'no' | 'yes'> label="Douleur" columns={2} value={pain} onPick={setPain} options={[{ value: 'no', label: 'Non' }, { value: 'yes', label: 'Oui' }]} />
        {pain === 'yes' ? (
          <div className="finish-more">
            <MultiChoice label="Zone" value={zone} onChange={(v) => setZone(v.slice(-1))} options={PAIN_ZONES} />
            <Choice<number> label="Intensité" columns={5} value={level} onPick={setLevel} options={[2, 4, 6, 8, 10].map((n) => ({ value: n, label: `${n}/10` }))} />
          </div>
        ) : null}
      </section>
      <div className="finish-actions">
        {onBack ? (
          <button type="button" className="btn ghost" onClick={onBack}>
            Revenir à la séance
          </button>
        ) : null}
        <button type="button" className="btn primary big" disabled={!ok} onClick={finish}>
          {ok ? 'Enregistrer' : 'Réponds aux questions'}
        </button>
      </div>
    </div>
  );
}
