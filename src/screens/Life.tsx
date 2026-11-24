import React, { useMemo, useState } from 'react';
import { getClaudeKey, removeNote, retryNote, useApp } from '../state/store';
import { addDays, longDate, type ISODate } from '../core/dates';
import { formatMinutes, PROJECT_SHORT, PROJECTS, workMinutes, type Note } from '../core/head';
import { IconBack, IconChevron, IconCoach, IconGear } from '../ui/icons';
import { useToday } from '../ui/hooks';
import { Coach } from './Coach';

const time = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function NoteItem({ n, sorting, hasKey }: { n: Note; sorting: boolean; hasKey: boolean }) {
  const [open, setOpen] = useState(false);
  const status = sorting ? 'Je la range…' : n.status === 'pending' ? (hasKey ? 'En attente' : 'En attente de ta clé Claude') : n.status === 'error' ? n.error : n.summary;
  return (
    <li className={`note${open ? ' open' : ''}`}>
      <button type="button" className="note-main" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="note-time num">{time(n.at)}</span>
        <span className="note-text">{n.text}</span>
        <span className={`note-status${n.status === 'error' ? ' bad' : ''}`}>{status}</span>
      </button>
      {open ? (
        <div className="note-more">
          {n.made?.length ? (
            <ul className="cap-made">
              {n.made.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}
          <div className="todo-actions">
            {n.status !== 'pending' ? (
              <button type="button" className="chip" onClick={() => retryNote(n.id)}>
                {n.status === 'error' ? 'Réessayer' : 'Ranger à nouveau'}
              </button>
            ) : null}
            <button type="button" className="chip danger" onClick={() => removeNote(n.id)}>
              Supprimer la note
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function Life({ onSettings }: { onSettings(): void }) {
  const data = useApp((r) => r.data);
  const sorting = useApp((r) => r.sorting);
  const today = useToday();
  const [date, setDate] = useState<ISODate>(today);
  const [coach, setCoach] = useState(false);
  const hasKey = !!getClaudeKey();
  const notes = useMemo(() => Object.values(data.notes).filter((n) => n.date === date).sort((a, b) => b.at - a.at), [data.notes, date]);
  const day = data.days[date];
  const work = workMinutes(data.work[date], Date.now());

  if (coach) {
    return (
      <>
        <button type="button" className="me-back" onClick={() => setCoach(false)}>
          <IconBack size={18} /> Vie
        </button>
        <Coach />
      </>
    );
  }

  return (
    <div className="screen">
      <header className="head">
        <div>
          <p>{date === today ? 'Ta journée' : longDate(date)}</p>
          <h1>Vie</h1>
        </div>
        <button type="button" className="round big" onClick={onSettings} aria-label="Réglages">
          <IconGear size={22} />
        </button>
      </header>

      <div className="day-nav">
        <button type="button" className="round" onClick={() => setDate(addDays(date, -1))} aria-label="Jour d'avant">
          <IconBack size={18} />
        </button>
        <span>{date === today ? 'Aujourd\'hui' : longDate(date)}</span>
        <button type="button" className="round flip" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="Jour d'après">
          <IconBack size={18} />
        </button>
      </div>

      <section className="card life-stats">
        <div>
          <small>Travail</small>
          <b className="num">{work.total ? formatMinutes(work.total) : '—'}</b>
          <span className="muted">
            {PROJECTS.filter((p) => work.by[p])
              .map((p) => `${PROJECT_SHORT[p]} ${formatMinutes(work.by[p])}`)
              .join(' · ')}
          </span>
        </div>
        <div>
          <small>Forme</small>
          <b className="num">{day?.pulses?.length ? day.pulses.map((p) => p.energy).filter(Boolean).join(' → ') || '—' : day?.recovery ? `${day.recovery}/10` : '—'}</b>
          <span className="muted">{day?.pulses?.length ? `${day.pulses.length} ${day.pulses.length > 1 ? 'points' : 'point'} dans la journée` : 'Dis-la en dictant'}</span>
        </div>
      </section>

      {day?.facts?.length ? (
        <section className="card">
          <h2 className="eyebrow">Ce que je retiens</h2>
          <ul className="facts">
            {day.facts.map((f, i) => (
              <li key={i}>
                <span className="num muted">{time(f.at)}</span> {f.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card">
        <h2 className="eyebrow">Ce que tu m'as dit</h2>
        {notes.length ? (
          <ul className="notes">
            {notes.map((n) => (
              <NoteItem key={n.id} n={n} sorting={sorting.includes(n.id)} hasKey={hasKey} />
            ))}
          </ul>
        ) : (
          <p className="empty">Aucune note ce jour-là. Touche le micro et parle en vrac.</p>
        )}
      </section>

      <p className="soon">Bientôt ici : tes tests A/B et les liens entre ta forme, tes repas, ton travail et tes séances.</p>

      <ul className="me-list card">
        <li>
          <button type="button" onClick={() => setCoach(true)}>
            <span className="me-icon">
              <IconCoach size={22} />
            </span>
            <span className="me-text">
              <strong>Coach</strong>
              <small>Tes tendances, une question</small>
            </span>
            <IconChevron size={18} />
          </button>
        </li>
      </ul>
    </div>
  );
}
