import React, { useEffect, useMemo, useState } from 'react';
import { patchTodo, startLock, stopLock, useApp } from '../state/store';
import { longDate } from '../core/dates';
import { clock, formatMinutes, PROJECT_SHORT, runningBlock, todayList, workMinutes, type Project } from '../core/head';
import { IconArrowRight, IconGear, IconPlay, IconStop } from '../ui/icons';
import { useToday } from '../ui/hooks';
import { Today } from './Today';
import { startOf } from './Head';

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

const LOCK_PROJECTS: Project[] = ['biz', 'ecole', 'perso'];

export function LockCard() {
  const work = useApp((r) => r.data.work);
  const today = useToday();
  const run = runningBlock(work, today);
  const now = useNow(!!run);
  const { total } = workMinutes(work[today], now);

  if (run) {
    return (
      <section className="card lock on" aria-live="polite">
        <div>
          <p className="lock-tag">Lock-in en cours · {PROJECT_SHORT[run.block.project]}</p>
          <p className="lock-clock num">{clock(now - run.block.start)}</p>
        </div>
        <button type="button" className="lock-stop" onClick={stopLock}>
          <IconStop size={18} /> Stop
        </button>
      </section>
    );
  }
  return (
    <section className="card lock">
      <div className="lock-head">
        <p className="lock-tag">Lock-in</p>
        <p className="lock-total">{total ? `${formatMinutes(total)} de vrai travail aujourd'hui` : 'Lance le chrono quand tu bosses'}</p>
      </div>
      <div className="lock-go">
        {LOCK_PROJECTS.map((p) => (
          <button key={p} type="button" onClick={() => startLock(p)}>
            <IconPlay size={14} /> {PROJECT_SHORT[p]}
          </button>
        ))}
      </div>
    </section>
  );
}

export function Home({ onSession, onSettings, onCheckin, onFood, onHead }: { onSession(): void; onSettings(): void; onCheckin(): void; onFood(): void; onHead(): void }) {
  const all = useApp((r) => r.data.todos);
  const today = useToday();
  const list = useMemo(() => todayList(Object.values(all), today, startOf(today)), [all, today]);
  const shown = list.slice(0, 4);
  const done = list.filter((t) => t.doneAt).length;

  return (
    <div className="screen">
      <header className="head">
        <div>
          <p>
            <span className="brand">Lock-in</span> · {longDate(today)}
          </p>
          <h1>Aujourd'hui</h1>
        </div>
        <button type="button" className="round big" onClick={onSettings} aria-label="Réglages">
          <IconGear size={22} />
        </button>
      </header>

      <LockCard />

      <section className="card today-list">
        <div className="row-head">
          <h2 className="eyebrow">Tes priorités</h2>
          {list.length ? (
            <span className="num muted">
              {done} sur {list.length}
            </span>
          ) : null}
        </div>
        {shown.length ? (
          <ul className="todos">
            {shown.map((t) => (
              <li key={t.id} className={`todo${t.doneAt ? ' done' : ''}`}>
                <div className="todo-row">
                  <label className="todo-check">
                    <input type="checkbox" checked={!!t.doneAt} onChange={() => patchTodo(t.id, { doneAt: t.doneAt ? undefined : Date.now() })} aria-label={`${t.doneAt ? 'Décocher' : 'Cocher'} : ${t.title}`} />
                  </label>
                  <button type="button" className="todo-main" onClick={onHead}>
                    <span className="todo-title">{t.title}</span>
                    <span className="todo-meta">
                      <span>{PROJECT_SHORT[t.project]}</span>
                    </span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Pas encore de priorités. Dicte ce que tu dois faire, ou choisis-les dans Tête.</p>
        )}
        <button type="button" className="link-row" onClick={onHead}>
          {list.length > shown.length ? `Voir les ${list.length - shown.length} autres` : 'Ouvrir ta to-do'} <IconArrowRight size={16} />
        </button>
      </section>

      <Today embedded onSession={onSession} onSettings={onSettings} onCheckin={onCheckin} onFood={onFood} />
    </div>
  );
}
