import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { tick } from './sound';

interface Props {
  label: string;
  values: number[];
  value: number;
  onChange(v: number): void;
  format?(v: number): string;
  onEdit?(): void;
  /** Row height in pixels; five rows show. */
  row?: number;
}

const VISIBLE = 5;
const REACH = 3;

function nearest(values: number[], v: number) {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (Math.abs(values[i] - v) < Math.abs(values[best] - v)) best = i;
  return best;
}

/** An iOS style picker: native momentum and snapping, the depth painted on the rows in view. */
export function Wheel({ label, values, value, onChange, format = String, onEdit, row = 42 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const index = useRef(nearest(values, value));
  const painted = useRef<number[]>([]);
  const frame = useRef(0);
  const latest = useRef({ values, onChange, onEdit });
  latest.current = { values, onChange, onEdit };

  const paint = () => {
    const el = box.current;
    if (!el) return;
    const items = el.firstElementChild?.children as HTMLCollectionOf<HTMLElement> | undefined;
    if (!items) return;
    const c = el.scrollTop / row;
    const from = Math.max(0, Math.floor(c) - REACH);
    const to = Math.min(items.length - 1, Math.ceil(c) + REACH);
    for (const i of painted.current) {
      if (i < from || i > to) {
        items[i]?.style.removeProperty('transform');
        items[i]?.style.removeProperty('opacity');
      }
    }
    const now: number[] = [];
    for (let i = from; i <= to; i++) {
      const d = i - c;
      const a = Math.min(Math.abs(d), REACH);
      items[i].style.transform = `perspective(420px) rotateX(${(-d * 21).toFixed(2)}deg) scale(${(1 - a * 0.1).toFixed(3)})`;
      items[i].style.opacity = (1 - a * 0.3).toFixed(3);
      now.push(i);
    }
    painted.current = now;
  };

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const i = nearest(values, value);
    if (i !== index.current || Math.abs(el.scrollTop - i * row) > row / 2) {
      index.current = i;
      el.scrollTop = i * row;
    }
    paint();
  }, [value, values, row]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    const i = Math.min(latest.current.values.length - 1, Math.max(0, Math.round(el.scrollTop / row)));
    if (i !== index.current) {
      index.current = i;
      tick();
      latest.current.onChange(latest.current.values[i]);
    }
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(paint);
  };

  const go = (i: number) => box.current?.scrollTo({ top: i * row, behavior: 'smooth' });

  const rows = useMemo(
    () =>
      values.map((v, i) => (
        <button key={v} type="button" tabIndex={-1} onClick={() => (i === index.current ? latest.current.onEdit?.() : go(i))}>
          {format(v)}
        </button>
      )),
    [values, format, row],
  );

  return (
    <div className="wheel" style={{ '--row': `${row}px` } as React.CSSProperties}>
      <span className="wheel-label">{label}</span>
      <div className="wheel-frame">
        <i className="wheel-band" aria-hidden="true" />
        <div
          className="wheel-scroll"
          ref={box}
          onScroll={onScroll}
          role="spinbutton"
          tabIndex={0}
          aria-label={label}
          aria-valuenow={value}
          aria-valuetext={format(value)}
          onKeyDown={(e) => {
            const i = nearest(values, value);
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              go(Math.max(0, i - 1));
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              go(Math.min(values.length - 1, i + 1));
            }
          }}
        >
          <div className="wheel-items" style={{ paddingBlock: (row * (VISIBLE - 1)) / 2 }}>
            {rows}
          </div>
        </div>
      </div>
    </div>
  );
}

export function loadValues(step: number, max: number, keep: number): number[] {
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(+v.toFixed(2));
  if (!out.some((v) => Math.abs(v - keep) < 1e-6)) {
    out.push(keep);
    out.sort((a, b) => a - b);
  }
  return out;
}

export const rowHeight = () => (window.innerHeight < 720 ? 30 : 40);
