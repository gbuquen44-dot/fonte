import React, { useEffect, useMemo, useRef, useState } from 'react';
import { updateDay, useApp } from '../state/store';
import { weighIns } from '../core/energy';
import type { ISODate } from '../core/dates';
import type { DayLog } from '../core/types';
import { plannedFor } from '../core/program';
import {
  BED_VALUES,
  bedValue,
  BELLY,
  CAFFEINE,
  clockFr,
  DINNER_END,
  ENERGY,
  EVENING,
  GYM_WANT,
  guessWake,
  HEAD,
  HUNGER,
  MOOD,
  MOTIVATION,
  NIGHT_WAKES,
  PAIN_AREAS,
  SCREEN,
  sleptHours,
  SORE_AREAS,
  SORENESS,
  STRESS,
  THIRST,
  toClock,
  toMinutes,
  WAKE_STYLE,
  WAKE_VALUES,
  type Opt,
} from '../core/checkin';
import { Choice, fr1, hours, MultiChoice, Sheet } from '../ui/controls';
import { rowHeight, Wheel } from '../ui/Wheel';

const WEIGHTS = Array.from({ length: 701 }, (_, i) => +(40 + i / 10).toFixed(1));

type NumKey = 'wakeStyle' | 'nightWakes' | 'head' | 'recovery' | 'mood' | 'motivation' | 'gymWant' | 'belly' | 'hunger' | 'thirst' | 'stress' | 'dinnerEnd' | 'lastCaffeine' | 'screenBed';

/** One tap per question: the answer is saved and the next question slides in. */
const ASK: Record<NumKey, { title: string; hint?: string; options: Opt[]; columns?: number }> = {
  wakeStyle: { title: 'Comment tu t\'es levé ?', options: WAKE_STYLE },
  nightWakes: { title: 'Réveillé dans la nuit ?', hint: 'Les fois où tu as ouvert les yeux, même pour te rendormir vite.', options: NIGHT_WAKES, columns: 2 },
  head: { title: 'Ta tête au réveil ?', options: HEAD },
  recovery: { title: 'Ton énergie, là ?', options: ENERGY },
  mood: { title: 'Ton humeur ?', options: MOOD },
  motivation: { title: 'Ton envie de bosser aujourd\'hui ?', options: MOTIVATION },
  gymWant: { title: 'Ton envie d\'aller à la salle ?', hint: 'Tu as séance aujourd\'hui.', options: GYM_WANT },
  belly: { title: 'Ton ventre au réveil ?', options: BELLY },
  hunger: { title: 'Ta faim au réveil ?', options: HUNGER },
  thirst: { title: 'Ta soif au réveil ?', options: THIRST },
  stress: { title: 'Ton stress hier ?', hint: 'Hors salle : école, business, perso.', options: STRESS },
  dinnerEnd: { title: 'Hier, ton dîner fini à quelle heure ?', options: DINNER_END },
  lastCaffeine: { title: 'Hier, ta dernière caféine ?', hint: 'Café, pré-workout, boisson énergisante.', options: CAFFEINE },
  screenBed: { title: 'Hier, écran au lit ?', hint: 'Téléphone ou ordi, une fois couché.', options: SCREEN, columns: 2 },
};

type Step = 'weight' | 'night' | 'soreness' | 'pains' | 'evening' | NumKey;

export function Checkin({ date, open, onClose }: { date: ISODate; open: boolean; onClose(): void }) {
  return (
    <Sheet open={open} onClose={onClose} label="Point du matin">
      {open ? <Flow date={date} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Flow({ date, onClose }: { date: ISODate; onClose(): void }) {
  const days = useApp((r) => r.data.days);
  const profile = useApp((r) => r.data.profile);
  const today: Partial<DayLog> = days[date] ?? {};
  /** His last full morning: the wheels start from it, so a usual night is one tap. */
  const before = useMemo(() => Object.values(days).filter((d) => d.date < date && d.checkinAt).sort((a, b) => a.date.localeCompare(b.date)).pop(), [days, date]);
  const lastWeight = useMemo(() => weighIns(days).filter((d) => d.date <= date).pop()?.weight ?? 70, [days, date]);
  const training = useMemo(() => !!(profile && plannedFor(date, profile)), [profile, date]);
  const row = useMemo(rowHeight, []);

  const steps: Step[] = useMemo(
    () => ['weight', 'night', 'wakeStyle', 'nightWakes', 'head', 'recovery', 'mood', 'motivation', ...(training ? (['gymWant'] as Step[]) : []), 'soreness', 'pains', 'belly', 'hunger', 'thirst', 'stress', 'dinnerEnd', 'lastCaffeine', 'screenBed', 'evening'],
    [training],
  );
  const [i, setI] = useState(0);
  const step = steps[Math.min(i, steps.length - 1)];

  const [weight, setWeight] = useState(today.weight ?? lastWeight);
  /** The wheel starts on his last weight: without a weigh-in, saving it would invent one. */
  const [weighed, setWeighed] = useState(!(today.checkinAt && today.weight === undefined));
  const [bed, setBed] = useState(bedValue(today.bedAt ?? before?.bedAt ?? '22:00'));
  const [wake, setWake] = useState(today.wakeAt ? toMinutes(today.wakeAt) : guessWake(new Date(), before?.wakeAt ?? '04:00'));
  const [nums, setNums] = useState<Partial<Record<NumKey, number>>>(() => {
    const out: Partial<Record<NumKey, number>> = {};
    for (const k of Object.keys(ASK) as NumKey[]) if (typeof today[k] === 'number') out[k] = today[k] as number;
    return out;
  });
  const [soreness, setSoreness] = useState(today.soreness);
  const [soreAreas, setSoreAreas] = useState<string[]>(today.soreAreas ?? []);
  const [pains, setPains] = useState<string[]>(today.pains ?? []);
  const [tags, setTags] = useState<string[]>(today.tags ?? []);

  const next = () => setI((n) => n + 1);
  const later = () => setTimeout(next, 170);
  const bedAt = toClock(bed);
  const wakeAt = toClock(wake);
  const sleepH = sleptHours(bedAt, wakeAt);
  const answers: Partial<DayLog> = { weight: weighed ? weight : undefined, bedAt, wakeAt, sleepH, ...nums, soreness, soreAreas: soreness ? soreAreas : [], pains, tags };
  const latest = useRef({ answers, i });
  latest.current = { answers, i };
  const finished = useRef(false);

  /** Closing halfway keeps the answers, and the morning stays to finish. */
  useEffect(
    () => () => {
      if (!finished.current && latest.current.i > 0) updateDay(date, latest.current.answers);
    },
    [date],
  );

  const finish = () => {
    finished.current = true;
    updateDay(date, { ...answers, checkinAt: Date.now() });
    onClose();
  };

  const ask = step in ASK ? ASK[step as NumKey] : null;

  return (
    <div className="flow">
      <div className="flow-pips" aria-hidden="true">
        {steps.map((s, n) => (
          <i key={s} className={n <= i ? 'on' : ''} />
        ))}
      </div>
      <div className="flow-step" key={step}>
        {step === 'weight' ? (
          <>
            <h2>Ton poids</h2>
            <p className="muted">Au réveil, à jeun. La roue part de ta dernière pesée.</p>
            <div className="wheels one">
              <div className="wheel-off" data-off={weighed ? undefined : ''} aria-disabled={!weighed}>
                <Wheel label="Poids (kg)" values={WEIGHTS} value={weight} onChange={setWeight} format={fr1} row={row} />
              </div>
            </div>
            <div className="tags weigh-skip">
              <button type="button" aria-pressed={!weighed} className={weighed ? '' : 'on'} onClick={() => setWeighed((w) => !w)}>
                Pas pesé ce matin
              </button>
            </div>
            <button type="button" className="btn primary big" onClick={next}>
              Continuer
            </button>
          </>
        ) : null}

        {step === 'night' ? (
          <>
            <h2>Ta nuit</h2>
            <p className="muted">L'heure où tu as éteint, et celle où tu t'es levé.</p>
            <div className="wheels">
              <Wheel label="Coucher" values={BED_VALUES} value={bed} onChange={setBed} format={clockFr} row={row} />
              <Wheel label="Lever" values={WAKE_VALUES} value={wake} onChange={setWake} format={clockFr} row={row} />
            </div>
            <p className="slept">
              Tu as dormi <b className="num">{hours(sleepH)}</b>
            </p>
            <button type="button" className="btn primary big" onClick={next}>
              Continuer
            </button>
          </>
        ) : null}

        {ask ? (
          <>
            <h2>{ask.title}</h2>
            {ask.hint ? <p className="muted">{ask.hint}</p> : null}
            <Choice<number>
              label={ask.title}
              rows={!ask.columns}
              columns={ask.columns ?? 1}
              value={nums[step as NumKey]}
              onPick={(v) => {
                setNums((x) => ({ ...x, [step]: v }));
                later();
              }}
              options={ask.options}
            />
          </>
        ) : null}

        {step === 'soreness' ? (
          <>
            <h2>Des courbatures ?</h2>
            <Choice<number>
              label="Courbatures"
              rows
              columns={1}
              value={soreness}
              onPick={(v) => {
                setSoreness(v);
                if (v === 0) later();
              }}
              options={SORENESS}
            />
            {soreness ? (
              <>
                <p className="muted">Où ?</p>
                <MultiChoice label="Où sont les courbatures" value={soreAreas} onChange={setSoreAreas} options={SORE_AREAS} />
                <button type="button" className="btn primary big" onClick={next}>
                  Continuer
                </button>
              </>
            ) : null}
          </>
        ) : null}

        {step === 'pains' ? (
          <>
            <h2>Une douleur ?</h2>
            <p className="muted">Une gêne dans une articulation, pas une courbature.</p>
            <MultiChoice label="Douleurs" value={pains} onChange={setPains} options={PAIN_AREAS} />
            {pains.length ? (
              <button type="button" className="btn primary big" onClick={next}>
                Continuer
              </button>
            ) : (
              <button
                type="button"
                className="btn ghost big"
                onClick={() => {
                  setPains([]);
                  next();
                }}
              >
                Aucune douleur
              </button>
            )}
          </>
        ) : null}

        {step === 'evening' ? (
          <>
            <h2>Hier soir</h2>
            <p className="muted">Coche tout ce qui s'est passé. Rien ? Termine directement.</p>
            <MultiChoice label="Hier soir" value={tags} onChange={setTags} options={EVENING} />
            <button type="button" className="btn primary big" onClick={finish}>
              Terminer
            </button>
          </>
        ) : null}
      </div>
      {i > 0 ? (
        <button type="button" className="link" onClick={() => setI((n) => n - 1)}>
          Retour
        </button>
      ) : null}
    </div>
  );
}
