import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './icons';

export const kg = (n: number) => String(n).replace('.', ',');
export const int = (n: number) => Math.round(n).toLocaleString('fr-FR').replace(/ /g, ' ');
export const fr1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');

export const hours = (n: number) => {
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
};

export function Sheet({ open, onClose, label, children, full }: { open: boolean; onClose(): void; label: string; children: React.ReactNode; full?: boolean }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; d: number } | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 380);
    return () => clearTimeout(t);
  }, [open]);

  if (!mounted) return null;

  const move = (e: React.PointerEvent) => {
    if (!drag.current || !panel.current) return;
    const d = Math.max(0, e.clientY - drag.current.y);
    drag.current.d = d;
    panel.current.style.transition = 'none';
    panel.current.style.transform = `translateY(${d}px)`;
  };
  const up = () => {
    if (!drag.current || !panel.current) return;
    panel.current.style.removeProperty('transition');
    panel.current.style.removeProperty('transform');
    if (drag.current.d > 110) onClose();
    drag.current = null;
  };

  return createPortal(
    <div className={`sheet-wrap${shown ? ' in' : ''}`}>
      <div className="sheet-scrim" onClick={onClose} />
      <div className={`sheet${full ? ' full' : ''}`} role="dialog" aria-modal="true" aria-label={label} ref={panel}>
        <div
          className="sheet-grab"
          onPointerDown={(e) => {
            drag.current = { y: e.clientY, d: 0 };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <i />
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function SheetHead({ title, onClose }: { title: string; onClose(): void }) {
  return (
    <div className="sheet-head">
      <h2>{title}</h2>
      <button type="button" className="round" onClick={onClose} aria-label="Fermer">
        <IconClose size={18} />
      </button>
    </div>
  );
}

export interface Opt<T> {
  value: T;
  label: string;
  sub?: string;
}

export function Choice<T extends string | number>({ label, options, value, onPick, columns }: { label: string; options: Opt<T>[]; value?: T; onPick(v: T): void; columns?: number }) {
  return (
    <div className="choice" role="radiogroup" aria-label={label} style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onPick(o.value)}>
          <span>{o.label}</span>
          {o.sub ? <small>{o.sub}</small> : null}
        </button>
      ))}
    </div>
  );
}

export function MultiChoice({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange(v: string[]): void }) {
  return (
    <div className="tags" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" aria-pressed={on} className={on ? 'on' : ''} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string | number>({ label, options, value, onPick }: { label: string; options: Opt<T>[]; value: T; onPick(v: T): void }) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="seg" role="tablist" aria-label={label} style={{ '--n': options.length, '--i': i } as React.CSSProperties}>
      <i aria-hidden="true" />
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onPick(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Keypad({ title, unit, initial, decimals, onDone, onCancel }: { title: string; unit: string; initial: number; decimals?: boolean; onDone(n: number): void; onCancel(): void }) {
  const [text, setText] = useState(initial ? kg(initial) : '');
  const press = (k: string) => {
    if (k === '⌫') setText((t) => t.slice(0, -1));
    else if (k === ',') setText((t) => (t.includes(',') || !decimals ? t : `${t || '0'},`));
    else setText((t) => (t.length >= 7 ? t : t === '0' ? k : t + k));
  };
  const value = Number(text.replace(',', '.'));
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', decimals ? ',' : '', '0', '⌫'];
  return createPortal(
    <div className="keypad-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="keypad-scrim" onClick={onCancel} />
      <div className="keypad">
        <p className="keypad-title">{title}</p>
        <p className="keypad-value num">
          {text || '0'} <small>{unit}</small>
        </p>
        <div className="keypad-keys">
          {keys.map((k, i) =>
            k ? (
              <button key={k} type="button" onClick={() => press(k)} aria-label={k === '⌫' ? 'Effacer' : k}>
                {k}
              </button>
            ) : (
              <span key={i} />
            ),
          )}
        </div>
        <div className="keypad-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Annuler
          </button>
          <button type="button" className="btn primary" onClick={() => onDone(Number.isFinite(value) ? value : 0)}>
            Valider
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function Ring({ value, max, size = 86, width = 9, color = 'var(--mint)', children }: { value: number; max: number; size?: number; width?: number; color?: string; children?: React.ReactNode }) {
  const r = (size - width) / 2;
  const c = 2 * Math.PI * r;
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={width} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="ring-value" />
      </svg>
      <span className="ring-inner">{children}</span>
    </span>
  );
}

export function Row({ label, value, sub, onClick, children }: { label: string; value?: string; sub?: string; onClick?(): void; children?: React.ReactNode }) {
  const body = (
    <>
      <span className="row-main">
        <span>{label}</span>
        {sub ? <small>{sub}</small> : null}
      </span>
      {value !== undefined ? <b className="num">{value}</b> : null}
      {children}
    </>
  );
  return onClick ? (
    <button type="button" className="row" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="row">{body}</div>
  );
}
