import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, diffDays, shortDate, type ISODate } from '../core/dates';
import { MUSCLE_LABEL, VOLUME_TABLE } from '../data/exercises';
import type { VolumeMap } from '../core/volume';
import type { Muscle } from '../core/types';
import { fr1, int } from './controls';

export interface Pt {
  date: ISODate;
  y: number;
}

export interface SeriesDef {
  id: string;
  label: string;
  color: string;
  points: Pt[];
  kind?: 'line' | 'dots' | 'bars';
}

function useWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    setW(ref.current.clientWidth || 320);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceTicks(lo: number, hi: number, count = 3): number[] {
  const span = Math.max(hi - lo, 1e-6);
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= raw) ?? raw;
  const start = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(6));
  return out;
}

export function TimeChart({
  series,
  from,
  to,
  height = 176,
  format = (n) => fr1(n),
  reference,
  floor,
  empty,
}: {
  series: SeriesDef[];
  from: ISODate;
  to: ISODate;
  height?: number;
  format?: (n: number) => string;
  reference?: { y: number; label: string };
  floor?: number;
  empty: string;
}) {
  const [box, width] = useWidth();
  const [scrub, setScrub] = useState<ISODate | null>(null);
  const visible = useMemo(
    () => series.map((s) => ({ ...s, points: s.points.filter((p) => p.date >= from && p.date <= to) })),
    [series, from, to],
  );
  const all = visible.flatMap((s) => s.points);
  const days = Math.max(1, diffDays(to, from));
  const right = 10;
  const top = 8;
  const bottom = 22;
  const plotH = height - top - bottom;

  if (!all.length) {
    return (
      <div className="chart-empty" ref={box}>
        {empty}
      </div>
    );
  }

  const ys = all.map((p) => p.y);
  if (reference) ys.push(reference.y);
  let lo = floor ?? Math.min(...ys);
  let hi = Math.max(...ys);
  if (hi - lo < 1e-6) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.12;
  if (floor === undefined) lo -= pad;
  hi += pad;
  const ticks = niceTicks(lo, hi);
  const tickLabel = (t: number) => (Number.isInteger(t) ? int(t) : fr1(t));
  const left = Math.max(...ticks.map((t) => tickLabel(t).length)) * 6.4 + 10;
  const plotW = Math.max(40, width - left - right);
  const x = (d: ISODate) => left + (diffDays(d, from) / days) * plotW;
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * plotH;
  const barW = Math.max(3, Math.min(12, plotW / (days + 1) - 2));

  const pick = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left - left) / plotW));
    const target = addDays(from, Math.round(ratio * days));
    const nearest = [...new Set(all.map((p) => p.date))].sort((a, b) => Math.abs(diffDays(a, target)) - Math.abs(diffDays(b, target)))[0];
    setScrub(nearest);
  };

  const shown = scrub ?? [...new Set(all.map((p) => p.date))].sort().pop()!;
  /** A line keeps its last value: a lift missing on that day still shows. */
  const pointOf = (s: SeriesDef) => (!s.kind || s.kind === 'line' ? s.points.filter((q) => q.date <= shown).pop() : s.points.find((q) => q.date === shown));
  const readings = visible.flatMap((s) => {
    const p = pointOf(s);
    return p ? [{ id: s.id, label: s.label, color: s.color, y: p.y }] : [];
  });

  return (
    <figure className="chart">
      <figcaption className="chart-read">
        <span className="num">{shortDate(shown)}</span>
        <span className="chart-values">
          {readings.map((r) => (
            <span key={r.id}>
              {visible.length > 1 ? <i style={{ background: r.color }} /> : null}
              {visible.length > 1 ? <small>{r.label}</small> : null}
              <b className="num">{format(r.y)}</b>
            </span>
          ))}
        </span>
      </figcaption>
      <div
        className="chart-box"
        ref={box}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => (e.buttons || e.pointerType === 'touch' ? pick(e.clientX) : undefined)}
        onPointerUp={() => setScrub(null)}
        onPointerCancel={() => setScrub(null)}
      >
        <svg width={width} height={height} role="img" aria-label={visible.map((s) => s.label).join(', ')}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={width - right} y1={y(t)} y2={y(t)} stroke="var(--hair)" />
              <text x={left - 6} y={y(t) + 4} textAnchor="end" className="tick">
                {tickLabel(t)}
              </text>
            </g>
          ))}
          {reference ? (
            <g>
              <line x1={left} x2={width - right} y1={y(reference.y)} y2={y(reference.y)} stroke="var(--ink-3)" strokeDasharray="4 4" />
              <text x={width - right} y={y(reference.y) - 5} textAnchor="end" className="tick ref">
                {reference.label}
              </text>
            </g>
          ) : null}
          {[from, addDays(from, Math.round(days / 2)), to].map((d, i) => (
            <text key={d} x={x(d)} y={height - 6} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} className="tick">
              {shortDate(d)}
            </text>
          ))}
          {visible.map((s) =>
            s.kind === 'bars'
              ? s.points.map((p) => {
                  const h = Math.max(2, y(lo) - y(p.y));
                  return <rect key={p.date} x={x(p.date) - barW / 2} y={y(p.y)} width={barW} height={h} rx={Math.min(3, barW / 2)} fill={p.date === shown ? 'var(--ink)' : s.color} />;
                })
              : null,
          )}
          {visible.map((s) => {
            if (s.kind === 'bars' || s.points.length < 2 || s.kind === 'dots') return null;
            const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ');
            return <path key={s.id} d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />;
          })}
          {visible.map((s) =>
            s.kind === 'dots'
              ? s.points.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.y)} r="2.500" fill={s.color} />)
              : null,
          )}
          <line x1={x(shown)} x2={x(shown)} y1={top} y2={height - bottom} stroke="var(--ink-3)" strokeWidth="1" opacity={scrub ? 1 : 0} />
          {visible.map((s) => {
            if (s.kind === 'bars') return null;
            const p = pointOf(s);
            return p ? <circle key={s.id} cx={x(p.date)} cy={y(p.y)} r="4" fill={s.color} stroke="var(--night)" strokeWidth="2" /> : null;
          })}
        </svg>
      </div>
    </figure>
  );
}

export function TotalRoad({ current, start, milestones }: { current: number; start: number; milestones: { label: string; total: number }[] }) {
  const end = Math.max(...milestones.map((m) => m.total), current);
  const span = Math.max(1, end - start);
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - start) / span) * 100))}%`;
  return (
    <div className="road" role="img" aria-label={`Total estimé ${int(current)} kg, objectif ${int(end)} kg`}>
      <div className="road-track">
        <i className="road-fill" style={{ width: pos(current) }} />
        {milestones.map((m) => (
          <b key={m.label} className={current >= m.total ? 'passed' : ''} style={{ left: pos(m.total) }} />
        ))}
      </div>
      <ul>
        {milestones.map((m) => (
          <li key={m.label} className={current >= m.total ? 'passed' : ''}>
            <span>{m.label}</span>
            <span className="num">{int(m.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VolumeBars({ volume }: { volume: VolumeMap }) {
  return (
    <ul className="volume">
      {VOLUME_TABLE.map((r) => {
        const v = volume[r.muscle as Muscle] ?? 0;
        const scale = (n: number) => `${Math.min(100, (n / r.cap) * 100)}%`;
        const state = v < r.min ? 'under' : v > r.cap ? 'over' : 'ok';
        return (
          <li key={r.muscle}>
            <span className="volume-name">{MUSCLE_LABEL[r.muscle]}</span>
            <span className="volume-track" aria-hidden="true">
              <i className="zone" style={{ left: scale(r.low), width: `calc(${scale(r.high)} - ${scale(r.low)})` }} />
              <i className={`fill ${state}`} style={{ width: scale(v) }} />
            </span>
            <span className="volume-value num">{fr1(v)}</span>
          </li>
        );
      })}
    </ul>
  );
}
