import React, { useRef, useState } from 'react';
import { addDays, diffDays, shortDate, type ISODate } from '../core/dates';
import type { WeighIn } from '../core/energy';
import { periodStats, type KcalBand } from '../core/weight';
import { niceTicks, useWidth } from './Chart';
import { fr1, int } from './controls';

export interface Span {
  from: ISODate;
  to: ISODate;
}

/** One hue for every calorie level, stronger as the calories rise. A level keeps its tint whatever the period shown. */
export function tint(levels: number[], kcal: number): number {
  if (levels.length < 2) return 0.12;
  return 0.06 + (0.16 * Math.max(0, levels.indexOf(kcal))) / (levels.length - 1);
}

export function WeightChart({
  points,
  trend,
  trendLabel,
  bands,
  levels,
  from,
  to,
  selection,
  onSelect,
}: {
  points: WeighIn[];
  trend: { date: ISODate; value: number }[];
  trendLabel: string;
  bands: KcalBand[];
  levels: number[];
  from: ISODate;
  to: ISODate;
  selection: Span | null;
  onSelect(s: Span): void;
}) {
  const [box, width] = useWidth();
  const [shown, setShown] = useState<ISODate | null>(null);
  const [live, setLive] = useState<Span | null>(null);
  const drag = useRef<{ start: ISODate; x: number; span?: Span } | null>(null);
  const pts = points.filter((p) => p.date >= from && p.date <= to);
  const line = trend.filter((p) => p.date >= from && p.date <= to);

  if (!pts.length) {
    return (
      <div className="chart-empty" ref={box}>
        Pas de pesée sur cette période.
      </div>
    );
  }

  const height = 252;
  const top = 28;
  const bottom = 24;
  const right = 10;
  const plotH = height - top - bottom;
  const days = diffDays(to, from) + 1;
  const ys = [...pts.map((p) => p.weight), ...line.map((p) => p.value)];
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (hi - lo < 1) {
    const mid = (hi + lo) / 2;
    lo = mid - 0.5;
    hi = mid + 0.5;
  }
  const pad = (hi - lo) * 0.14;
  lo -= pad;
  hi += pad;
  const ticks = niceTicks(lo, hi, 4);
  const left = Math.max(...ticks.map((t) => fr1(t).length)) * 6.4 + 12;
  const plotW = Math.max(60, width - left - right);
  const slot = plotW / days;
  const edge = (d: ISODate) => left + diffDays(d, from) * slot;
  const x = (d: ISODate) => edge(d) + slot / 2;
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * plotH;

  const dayAt = (clientX: number): ISODate => {
    const rect = box.current?.getBoundingClientRect();
    const i = rect ? Math.floor((clientX - rect.left - left) / slot) : days - 1;
    return addDays(from, Math.min(days - 1, Math.max(0, i)));
  };
  const nearest = (d: ISODate) => pts.reduce((a, b) => (Math.abs(diffDays(b.date, d)) < Math.abs(diffDays(a.date, d)) ? b : a)).date;

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dayAt(e.clientX);
    drag.current = { start: d, x: e.clientX };
    setShown(nearest(d));
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g) return;
    const d = dayAt(e.clientX);
    if (!g.span && Math.abs(e.clientX - g.x) < 10) {
      setShown(nearest(d));
      return;
    }
    if (!g.span) e.currentTarget.setPointerCapture(e.pointerId);
    g.span = g.start <= d ? { from: g.start, to: d } : { from: d, to: g.start };
    setLive(g.span);
  };
  const up = () => {
    const span = drag.current?.span;
    drag.current = null;
    setLive(null);
    if (span) {
      setShown(null);
      onSelect(span);
    }
  };
  const cancel = () => {
    drag.current = null;
    setLive(null);
  };

  const day = shown && shown >= from && shown <= to ? shown : pts[pts.length - 1].date;
  const weighIn = pts.find((p) => p.date === day);
  const mean = line.filter((p) => p.date <= day).pop();
  const band = bands.find((b) => b.from <= day && b.to >= day);
  const span = live ?? (selection && selection.to >= from && selection.from <= to ? selection : null);
  const spanMean = span ? periodStats(pts, span.from, span.to).mean : undefined;
  const spanFrom = span ? (span.from < from ? from : span.from) : from;
  const spanTo = span ? (span.to > to ? to : span.to) : to;

  return (
    <figure className="chart wchart">
      <figcaption className="chart-read">
        <span className="num">{shortDate(day)}</span>
        <span className="chart-values">
          {weighIn ? (
            <span>
              <i className="key-dot" />
              <small>Pesée</small>
              <b className="num">{fr1(weighIn.weight)} kg</b>
            </span>
          ) : null}
          {mean ? (
            <span>
              <i className="key-line" />
              <small>{trendLabel}</small>
              <b className="num">{fr1(mean.value)} kg</b>
            </span>
          ) : null}
          {band ? (
            <span>
              <small className="num">{int(band.kcal)} kcal</small>
            </span>
          ) : null}
        </span>
      </figcaption>
      <div className="chart-box" ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}>
        <svg width={width} height={height} role="img" aria-label={`Poids du ${shortDate(from)} au ${shortDate(to)}, avec le fond qui suit tes calories prévues`}>
          {bands.map((b) => {
            const x0 = edge(b.from);
            const w = edge(addDays(b.to, 1)) - x0;
            const label = w >= 76 ? `${int(b.kcal)} kcal` : w >= 44 ? int(b.kcal) : '';
            return (
              <g key={b.from}>
                <rect x={x0} y={4} width={w} height={top + plotH - 4} fill="var(--amber)" opacity={tint(levels, b.kcal)} />
                {x0 > left + 0.5 ? <line x1={x0} x2={x0} y1={4} y2={top + plotH} stroke="var(--hair)" /> : null}
                {label ? (
                  <text x={x0 + 6} y={19} className="wband">
                    {label}
                  </text>
                ) : null}
              </g>
            );
          })}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={width - right} y1={y(t)} y2={y(t)} stroke="var(--hair)" />
              <text x={left - 6} y={y(t) + 4} textAnchor="end" className="tick">
                {fr1(t)}
              </text>
            </g>
          ))}
          {[from, addDays(from, Math.floor((days - 1) / 2)), to].map((d, i) => (
            <text key={`${d}-${i}`} x={i === 0 ? left : i === 2 ? width - right : x(d)} y={height - 6} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} className="tick">
              {shortDate(d)}
            </text>
          ))}
          {span ? <rect x={edge(spanFrom)} y={top} width={edge(addDays(spanTo, 1)) - edge(spanFrom)} height={plotH} fill="var(--sky)" opacity="0.16" rx="4" /> : null}
          {span && spanMean !== undefined ? <line x1={edge(spanFrom)} x2={edge(addDays(spanTo, 1))} y1={y(spanMean)} y2={y(spanMean)} stroke="var(--sky)" strokeWidth="2" strokeLinecap="round" /> : null}
          {line.length > 1 ? <path d={line.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')} fill="none" stroke="var(--mint)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {pts.map((p) => (
            <circle key={p.date} cx={x(p.date)} cy={y(p.weight)} r="4" fill="var(--ink-2)" stroke="var(--chart-ring)" strokeWidth="2" />
          ))}
          <line x1={x(day)} x2={x(day)} y1={top} y2={top + plotH} stroke="var(--ink-3)" opacity={shown && !live ? 1 : 0} />
          {weighIn ? <circle cx={x(day)} cy={y(weighIn.weight)} r="5.5" fill="var(--ink)" stroke="var(--chart-ring)" strokeWidth="2" /> : null}
        </svg>
      </div>
      <ul className="wlegend" aria-hidden="true">
        <li>
          <i className="key-dot" /> Pesées
        </li>
        <li>
          <i className="key-line" /> {trendLabel}
        </li>
        <li>
          <i className="key-band" /> Fond : tes calories prévues
        </li>
      </ul>
    </figure>
  );
}
