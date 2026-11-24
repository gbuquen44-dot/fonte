import React, { useMemo, useState } from 'react';
import { patchTodo, removeTodo, useApp } from '../state/store';
import { addDays, shortDate, type ISODate } from '../core/dates';
import { byProject, formatMinutes, PROJECT_LABEL, PROJECT_SHORT, PROJECTS, todayList, type Project, type Todo } from '../core/head';
import { Segmented } from '../ui/controls';
import { IconChevron } from '../ui/icons';
import { useToday } from '../ui/hooks';

export const startOf = (date: ISODate) => new Date(`${date}T00:00:00`).getTime();

function dueLabel(t: Todo, today: ISODate): { text: string; late: boolean } | null {
  if (!t.due) return null;
  if (t.due < today) return { text: 'en retard', late: true };
  if (t.due === today) return { text: 'aujourd\'hui', late: false };
  if (t.due === addDays(today, 1)) return { text: 'demain', late: false };
  return { text: `avant le ${shortDate(t.due)}`, late: false };
}

export function TodoRow({ t, today, pinned }: { t: Todo; today: ISODate; pinned?: boolean }) {
  const [open, setOpen] = useState(false);
  const due = dueLabel(t, today);
  const stepsDone = t.steps.filter((s) => s.done).length;
  return (
    <li className={`todo${t.doneAt ? ' done' : ''}${open ? ' open' : ''}`}>
      <div className="todo-row">
        <label className="todo-check">
          <input type="checkbox" checked={!!t.doneAt} onChange={() => patchTodo(t.id, { doneAt: t.doneAt ? undefined : Date.now() })} aria-label={`${t.doneAt ? 'Décocher' : 'Cocher'} : ${t.title}`} />
        </label>
        <button type="button" className="todo-main" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="todo-title">{t.title}</span>
          <span className="todo-meta">
            {pinned ? <span>{PROJECT_SHORT[t.project]}</span> : null}
            {t.minutes ? <span>{formatMinutes(t.minutes)}</span> : null}
            {t.steps.length ? (
              <span>
                {stepsDone}/{t.steps.length} étapes
              </span>
            ) : null}
            {due ? <span className={due.late ? 'late' : 'due'}>{due.text}</span> : null}
          </span>
        </button>
      </div>
      {open ? (
        <div className="todo-more">
          {t.steps.length ? (
            <ol className="todo-steps">
              {t.steps.map((s, i) => (
                <li key={i}>
                  <label>
                    <input type="checkbox" checked={!!s.done} onChange={() => patchTodo(t.id, { steps: t.steps.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })} />
                    <span>{s.text}</span>
                  </label>
                </li>
              ))}
            </ol>
          ) : null}
          <div className="todo-actions">
            {t.day === today ? (
              <>
                <button type="button" className="chip" onClick={() => patchTodo(t.id, { day: addDays(today, 1) })}>
                  Demain
                </button>
                <button type="button" className="chip" onClick={() => patchTodo(t.id, { day: undefined })}>
                  Retirer d'aujourd'hui
                </button>
              </>
            ) : (
              <button type="button" className="chip on" onClick={() => patchTodo(t.id, { day: today })}>
                Pour aujourd'hui
              </button>
            )}
            <button type="button" className="chip danger" onClick={() => removeTodo(t.id)}>
              Supprimer
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function IdeaRow({ t }: { t: Todo }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`todo idea${open ? ' open' : ''}`}>
      <button type="button" className="todo-main" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="todo-title">{t.title}</span>
        <span className="todo-meta">
          <span>{new Date(t.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
        </span>
      </button>
      {open ? (
        <div className="todo-actions">
          <button type="button" className="chip on" onClick={() => patchTodo(t.id, { kind: 'task' })}>
            En faire une tâche
          </button>
          <button type="button" className="chip danger" onClick={() => removeTodo(t.id)}>
            Supprimer
          </button>
        </div>
      ) : null}
    </li>
  );
}

function Group({ project, items, children }: { project: Project; items: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(project === 'biz');
  return (
    <section className={`card group${open ? ' open' : ''}`}>
      <button type="button" className="group-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`dot p-${project}`} aria-hidden="true" />
        <strong>{PROJECT_LABEL[project]}</strong>
        <span className="num">{items}</span>
        <IconChevron size={18} />
      </button>
      {open ? <ul className="todos">{children}</ul> : null}
    </section>
  );
}

export function Head() {
  const all = useApp((r) => r.data.todos);
  const today = useToday();
  const [view, setView] = useState<'todo' | 'idea'>('todo');
  const todos = useMemo(() => Object.values(all), [all]);
  const list = useMemo(() => todayList(todos, today, startOf(today)), [todos, today]);
  const pinnedIds = useMemo(() => new Set(list.map((t) => t.id)), [list]);
  const tasks = useMemo(() => byProject(todos, 'task', pinnedIds), [todos, pinnedIds]);
  const ideas = useMemo(() => byProject(todos, 'idea', new Set()), [todos]);
  const ideaCount = PROJECTS.reduce((a, p) => a + ideas[p].length, 0);
  const left = list.filter((t) => !t.doneAt).length;

  return (
    <div className="screen">
      <header className="head">
        <div>
          <p>{view === 'todo' ? (list.length ? `${left} sur ${list.length} à faire aujourd'hui` : 'Ta to-do') : 'Tout ce qui te passe par la tête'}</p>
          <h1>Tête</h1>
        </div>
      </header>
      <Segmented<'todo' | 'idea'>
        label="Vue"
        value={view}
        onPick={setView}
        options={[
          { value: 'todo', label: 'To-do' },
          { value: 'idea', label: ideaCount ? `Idées · ${ideaCount}` : 'Idées' },
        ]}
      />

      {view === 'todo' ? (
        <>
          <section className="card today-list">
            <h2 className="eyebrow">Aujourd'hui</h2>
            {list.length ? (
              <ul className="todos">
                {list.map((t) => (
                  <TodoRow key={t.id} t={t} today={today} pinned />
                ))}
              </ul>
            ) : (
              <p className="empty">Rien pour aujourd'hui. Touche une tâche plus bas puis « Pour aujourd'hui », ou dicte ce que tu dois faire.</p>
            )}
          </section>
          {PROJECTS.filter((p) => tasks[p].length).map((p) => (
            <Group key={p} project={p} items={tasks[p].length}>
              {tasks[p].map((t) => (
                <TodoRow key={t.id} t={t} today={today} />
              ))}
            </Group>
          ))}
          {!todos.some((t) => t.kind === 'task') ? <p className="empty center">Dicte tout ce que tu as en tête avec le micro : je range les tâches ici.</p> : null}
        </>
      ) : (
        <>
          {PROJECTS.filter((p) => ideas[p].length).map((p) => (
            <Group key={p} project={p} items={ideas[p].length}>
              {ideas[p].map((t) => (
                <IdeaRow key={t.id} t={t} />
              ))}
            </Group>
          ))}
          {!ideaCount ? <p className="empty center">Tes idées arrivent ici quand tu les dictes.</p> : null}
        </>
      )}
    </div>
  );
}
