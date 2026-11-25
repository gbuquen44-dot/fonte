import React, { useEffect, useMemo, useRef, useState } from 'react';
import { updateDay, useApp } from '../state/store';
import { weighIns } from '../core/energy';
import type { ISODate } from '../core/dates';
import type { DayLog } from '../core/types';
import { BED_VALUES, bedValue, BELLY, clockFr, ENERGY, EVENING, guessWake, HUNGER, MOTIVATION, NIGHT_WAKES, sleptHours, SORE_AREAS, SORENESS, toClock, toMinutes, WAKE_STYLE, WAKE_VALUES } from '../core/checkin';
import { Choice, fr1, hours, MultiChoice, Sheet } from '../ui/controls';
import { rowHeight, Wheel } from '../ui/Wheel';

const WEIGHTS = Array.from({ length: 701 }, (_, i) => +(40 + i / 10).toFixed(1));
const STEPS = 9;

export function Checkin({ date, open, onClose }: { date: ISODate; open: boolean; onClose(): void }) {
  return (
    <Sheet open={open} onClose={onClose} label="Point du matin">
      {open ? <Flow date={date} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Flow({ date, onClose }: { date: ISODate; onClose(): void }) {
  const days = useApp((r) => r.data.days);
  const today: Partial<DayLog> = days[date] ?? {};
  /** His last full morning: the wheels start from it, so a usual night is one tap. */
  const before = useMemo(() => Object.values(days).filter((d) => d.date < date && d.checkinAt).sort((a, b) => a.date.localeCompare(b.date)).pop(), [days, date]);
  const lastWeight = useMemo(() => weighIns(days).filter((d) => d.date <= date).pop()?.weight ?? 70, [days, date]);
  const row = useMemo(rowHeight, []);

  const [step, setStep] = useState(0);
  const [weight, setWeight] = useState(today.weight ?? lastWeight);
  /** The wheel starts on his last weight: without a weigh-in, saving it would invent one. */
  const [weighed, setWeighed] = useState(!(today.checkinAt && today.weight === undefined));
  const [bed, setBed] = useState(bedValue(today.bedAt ?? before?.bedAt ?? '22:00'));
  const [wake, setWake] = useState(today.wakeAt ? toMinutes(today.wakeAt) : guessWake(new Date(), before?.wakeAt ?? '04:00'));
  const [wakeStyle, setWakeStyle] = useState(today.wakeStyle);
  const [nightWakes, setNightWakes] = useState(today.nightWakes);
  const [recovery, setRecovery] = useState(today.recovery);
  const [motivation, setMotivation] = useState(today.motivation);
  const [soreness, setSoreness] = useState(today.soreness);
  const [soreAreas, setSoreAreas] = useState<string[]>(today.soreAreas ?? []);
  const [belly, setBelly] = useState(today.belly);
  const [hunger, setHunger] = useState(today.hunger);
  const [tags, setTags] = useState<string[]>(today.tags ?? []);

  const next = () => setStep((s) => s + 1);
  const pick = (set: (v: number) => void) => (v: number) => {
    set(v);
    setTimeout(next, 170);
  };
  const bedAt = toClock(bed);
  const wakeAt = toClock(wake);
  const sleepH = sleptHours(bedAt, wakeAt);
  const answers: Partial<DayLog> = { weight: weighed ? weight : undefined, bedAt, wakeAt, sleepH, wakeStyle, nightWakes, recovery, motivation, soreness, soreAreas: soreness ? soreAreas : [], belly, hunger, tags };
  const latest = useRef({ answers, step });
  latest.current = { answers, step };
  const finished = useRef(false);

  /** Closing halfway keeps the answers, and the morning stays to finish. */
  useEffect(
    () => () => {
      if (!finished.current && latest.current.step > 0) updateDay(date, latest.current.answers);
    },
    [date],
  );

  const finish = () => {
    finished.current = true;
    updateDay(date, { ...answers, checkinAt: Date.now() });
    onClose();
  };

  return (
    <div className="flow">
      <div className="flow-pips" aria-hidden="true">
        {Array.from({ length: STEPS + 1 }, (_, i) => (
          <i key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      <div className="flow-step" key={step}>
        {step === 0 ? (
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
        {step === 1 ? (
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
        {step === 2 ? (
          <>
            <h2>Comment tu t'es levé ?</h2>
            <Choice<number> label="Le réveil" rows columns={1} value={wakeStyle} onPick={pick(setWakeStyle)} options={WAKE_STYLE} />
          </>
        ) : null}
        {step === 3 ? (
          <>
            <h2>Réveillé dans la nuit ?</h2>
            <p className="muted">Les fois où tu as ouvert les yeux, même pour te rendormir vite.</p>
            <Choice<number> label="Réveils dans la nuit" columns={2} value={nightWakes} onPick={pick(setNightWakes)} options={NIGHT_WAKES} />
          </>
        ) : null}
        {step === 4 ? (
          <>
            <h2>Ton énergie, là ?</h2>
            <Choice<number> label="Énergie" rows columns={1} value={recovery} onPick={pick(setRecovery)} options={ENERGY} />
          </>
        ) : null}
        {step === 5 ? (
          <>
            <h2>Ton envie de bosser aujourd'hui ?</h2>
            <Choice<number> label="Envie de bosser" rows columns={1} value={motivation} onPick={pick(setMotivation)} options={MOTIVATION} />
          </>
        ) : null}
        {step === 6 ? (
          <>
            <h2>Des courbatures ?</h2>
            <Choice<number>
              label="Courbatures"
              rows
              columns={1}
              value={soreness}
              onPick={(v) => {
                setSoreness(v);
                if (v === 0) setTimeout(next, 170);
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
        {step === 7 ? (
          <>
            <h2>Ton ventre au réveil ?</h2>
            <Choice<number> label="Ventre" rows columns={1} value={belly} onPick={pick(setBelly)} options={BELLY} />
          </>
        ) : null}
        {step === 8 ? (
          <>
            <h2>Ta faim au réveil ?</h2>
            <Choice<number> label="Faim" rows columns={1} value={hunger} onPick={pick(setHunger)} options={HUNGER} />
          </>
        ) : null}
        {step >= 9 ? (
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
      {step > 0 ? (
        <button type="button" className="link" onClick={() => setStep((s) => s - 1)}>
          Retour
        </button>
      ) : null}
    </div>
  );
}
