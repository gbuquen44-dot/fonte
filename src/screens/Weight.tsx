import React, { useMemo, useState } from 'react';
import { useApp } from '../state/store';
import { addDays, shortDate, type ISODate } from '../core/dates';
import { weighIns } from '../core/energy';
import { plural } from '../core/labels';
import { kcalBands, periodStats, rollingMean, trendRead } from '../core/weight';
import { fr1, int, Segmented, Sheet, SheetHead } from '../ui/controls';
import { IconClose } from '../ui/icons';
import { useToday } from '../ui/hooks';
import { tint, WeightChart, type Span } from '../ui/WeightChart';

const SPANS = [
  { value: 14, label: '2 sem.' },
  { value: 30, label: '1 mois' },
  { value: 90, label: '3 mois' },
  { value: 0, label: 'Tout' },
];

const VERDICT = { down: 'Tu perds encore.', flat: 'Ton poids est stable.', up: 'Tu prends du poids.' };

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fr1(Math.abs(n))} kg`;

function periodText(s: Span, today: ISODate): string {
  if (s.from === s.to) return `le ${shortDate(s.from)}`;
  if (s.to === today) return `depuis le ${shortDate(s.from)}`;
  return `du ${shortDate(s.from)} au ${shortDate(s.to)}`;
}

export function WeightSheet({ open, onClose, days, onDays }: { open: boolean; onClose(): void; days: number; onDays(n: number): void }) {
  return (
    <Sheet open={open} onClose={onClose} label="Ton poids en détail" full>
      <SheetHead title="Poids" onClose={onClose} />
      <WeightDetail days={days} onDays={onDays} />
    </Sheet>
  );
}

function WeightDetail({ days: n, onDays }: { days: number; onDays(n: number): void }) {
  const data = useApp((r) => r.data);
  const p = data.profile!;
  const today = useToday();
  const weights = useMemo(() => weighIns(data.days), [data.days]);
  const trend = useMemo(() => rollingMean(weights, n), [weights, n]);
  const [span, setSpan] = useState(30);
  const [sel, setSel] = useState<Span | null>(null);
  const first = weights[0]?.date ?? today;
  const from = span ? addDays(today, 1 - span) : first < today ? first : addDays(today, -6);
  const plan = p.kcalPlan.filter((s) => s.from <= today);
  const levels = [...new Set(plan.map((s) => s.kcal))].sort((a, b) => a - b);
  const start = plan.reduce((a, s) => (s.from < a ? s.from : a), today);
  const steps = kcalBands(plan, start, today).reverse();
  const read = trendRead(weights, today, n);
  const picked = sel ? periodStats(weights, sel.from, sel.to) : null;
  const label = `Moyenne ${n} jours`;

  const pick = (s: Span | null) => {
    setSel(s);
    if (s && s.from < from) setSpan(0);
  };

  return (
    <div className="wdetail">
      <section className="wtrend" aria-live="polite">
        {read.now.mean !== undefined ? (
          <>
            <p className="wtrend-value num">
              {fr1(read.now.mean)} <small>kg</small>
            </p>
            <p className="wtrend-sub">
              En moyenne sur les {n} derniers jours, {read.now.n} {plural(read.now.n, 'pesée')}.
            </p>
            {read.delta !== undefined && read.verdict ? (
              <p className="wtrend-read">
                <b className="num">{signed(read.delta)}</b> par rapport aux {n} jours d'avant. {VERDICT[read.verdict]}
              </p>
            ) : (
              <p className="wtrend-read">Pèse-toi chaque matin : la comparaison avec les {n} jours d'avant arrive après {2 * n} jours de pesées.</p>
            )}
          </>
        ) : (
          <p className="wtrend-read">Pas de pesée sur les {n} derniers jours. Ta moyenne revient dès ta prochaine pesée.</p>
        )}
        <Segmented<number> label="Moyenne sur" value={n} onPick={onDays} options={[4, 5, 6].map((v) => ({ value: v, label: `${v} jours` }))} />
      </section>

      <Segmented<number> label="Période du graphique" value={span} onPick={setSpan} options={SPANS} />

      <WeightChart points={weights} trend={trend} trendLabel={label} bands={kcalBands(plan, from, today)} levels={levels} from={from} to={today} selection={sel} onSelect={pick} />

      {sel && picked ? (
        <div className="wsel">
          <div>
            <p className="wsel-value num">{picked.mean !== undefined ? `${fr1(picked.mean)} kg` : 'Aucune pesée'}</p>
            <p className="wsel-sub">
              En moyenne {periodText(sel, today)}, {picked.n} {plural(picked.n, 'pesée')}
              {picked.min !== undefined && picked.max !== undefined && picked.n > 1 ? `, de ${fr1(picked.min)} à ${fr1(picked.max)} kg` : ''}.
            </p>
          </div>
          <button type="button" className="round" onClick={() => setSel(null)} aria-label="Effacer la période choisie">
            <IconClose size={18} />
          </button>
        </div>
      ) : (
        <p className="whint">Glisse ton doigt sur le graphique pour avoir ta moyenne sur une période, ou touche un palier.</p>
      )}

      {steps.length ? (
        <section className="wsteps">
          <h3>Tes paliers de calories</h3>
          <ul>
            {steps.map((b) => {
              const st = periodStats(weights, b.from, b.to);
              const on = sel?.from === b.from && sel?.to === b.to;
              return (
                <li key={b.from}>
                  <button type="button" aria-pressed={on} className={on ? 'on' : ''} onClick={() => pick(on ? null : { from: b.from, to: b.to })}>
                    <i className="wsteps-key" style={{ '--a': Math.max(0.2, tint(levels, b.kcal) * 2.6) } as React.CSSProperties} />
                    <span className="wsteps-name">
                      <b className="num">{int(b.kcal)} kcal</b>
                      <small>{periodText(b, today)}</small>
                    </span>
                    <span className="wsteps-mean">
                      <b className="num">{st.mean !== undefined ? `${fr1(st.mean)} kg` : '–'}</b>
                      <small>
                        {st.n} {plural(st.n, 'pesée')}
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <p className="wnote">Ton poids bouge d'un jour à l'autre avec l'eau, le sel et les glucides. Compare des moyennes, pas des pesées.</p>
    </div>
  );
}
