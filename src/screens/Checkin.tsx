import React, { useMemo, useState } from 'react';
import { updateDay, useApp } from '../state/store';
import { weighIns } from '../core/energy';
import type { ISODate } from '../core/dates';
import { Choice, fr1, hours, MultiChoice, Sheet } from '../ui/controls';
import { rowHeight, Wheel } from '../ui/Wheel';

const FIVE = ['Très mal', 'Mal', 'Moyen', 'Bien', 'Très bien'];
const FORM: [number, string][] = [[2, 'Cassé'], [4, 'Fatigué'], [6, 'Moyen'], [8, 'Bien'], [10, 'Au top']];
const STRESS = ['Aucun', 'Léger', 'Moyen', 'Fort', 'Énorme'];
const TAGS = ['Alcool', 'Caféine tardive', 'Repas tardif', 'Chaleur', 'Bruit', 'Réveil forcé', 'Malade'];
const WEIGHTS = Array.from({ length: 701 }, (_, i) => +(40 + i / 10).toFixed(1));
const SLEEP = Array.from({ length: 29 }, (_, i) => i / 2);

export function Checkin({ date, open, onClose }: { date: ISODate; open: boolean; onClose(): void }) {
  return (
    <Sheet open={open} onClose={onClose} label="Point du matin">
      {open ? <Flow date={date} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Flow({ date, onClose }: { date: ISODate; onClose(): void }) {
  const days = useApp((r) => r.data.days);
  const today = days[date];
  const lastWeight = useMemo(() => weighIns(days).filter((d) => d.date <= date).pop()?.weight ?? 70, [days, date]);
  const row = useMemo(rowHeight, []);
  const [step, setStep] = useState(0);
  const [weight, setWeight] = useState(today?.weight ?? lastWeight);
  const [sleepH, setSleep] = useState(today?.sleepH ?? 7.5);
  const [sleepQ, setQ] = useState(today?.sleepQ);
  const [recovery, setRecovery] = useState(today?.recovery);
  const [dayFeel, setFeel] = useState(today?.dayFeel);
  const [stress, setStress] = useState(today?.stress);
  const [tags, setTags] = useState<string[]>(today?.tags ?? []);
  const next = () => setStep((s) => s + 1);
  const pick = (set: (v: number) => void) => (v: number) => {
    set(v);
    setTimeout(next, 170);
  };
  const finish = () => {
    updateDay(date, { weight, sleepH, sleepQ, dayFeel, stress, recovery, tags, checkinAt: Date.now() });
    onClose();
  };
  const STEPS = 5;
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
            <h2>Ta nuit et ton poids</h2>
            <p className="muted">Fais tourner les roues, c'est déjà prérempli.</p>
            <div className="wheels">
              <Wheel label="Sommeil" values={SLEEP} value={sleepH} onChange={setSleep} format={hours} row={row} />
              <Wheel label="Poids (kg)" values={WEIGHTS} value={weight} onChange={setWeight} format={fr1} row={row} />
            </div>
            <button type="button" className="btn primary big" onClick={next}>
              Continuer
            </button>
          </>
        ) : null}
        {step === 1 ? (
          <>
            <h2>Tu as bien dormi ?</h2>
            <Choice<number> label="Qualité du sommeil" columns={1} value={sleepQ} onPick={pick(setQ)} options={FIVE.map((label, i) => ({ value: i + 1, label }))} />
          </>
        ) : null}
        {step === 2 ? (
          <>
            <h2>Ta forme ce matin ?</h2>
            <Choice<number> label="Forme" columns={1} value={recovery} onPick={pick(setRecovery)} options={FORM.map(([value, label]) => ({ value, label }))} />
          </>
        ) : null}
        {step === 3 ? (
          <>
            <h2>Hier, tu t'es senti comment ?</h2>
            <Choice<number> label="Journée d'hier" columns={1} value={dayFeel} onPick={pick(setFeel)} options={FIVE.map((label, i) => ({ value: i + 1, label }))} />
          </>
        ) : null}
        {step === 4 ? (
          <>
            <h2>Ton stress hier, hors salle ?</h2>
            <Choice<number> label="Stress" columns={1} value={stress} onPick={pick(setStress)} options={STRESS.map((label, i) => ({ value: i, label }))} />
          </>
        ) : null}
        {step >= 5 ? (
          <>
            <h2>Un détail sur la nuit ?</h2>
            <p className="muted">Facultatif. Ça aide à trouver ce qui joue sur ton sommeil.</p>
            <MultiChoice label="Événements" value={tags} onChange={setTags} options={TAGS} />
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
