import { addDays, type ISODate } from './dates';

/* Lock-in's "Tête": what he dictates, what it turns into, and the time he really works. */

export type Project = 'biz' | 'ecole' | 'salle' | 'perso';

export const PROJECTS: Project[] = ['biz', 'ecole', 'salle', 'perso'];

/** Names shown in the app. The business name comes from his private profile, never from this public code. */
export const PROJECT_LABEL: Record<Project, string> = { biz: 'Business', ecole: 'École', salle: 'Salle', perso: 'Perso' };
export const PROJECT_SHORT: Record<Project, string> = { biz: 'Business', ecole: 'École', salle: 'Salle', perso: 'Perso' };

export function setProjectNames(names?: Partial<Record<Project, { label: string; short?: string }>>) {
  for (const p of PROJECTS) {
    const n = names?.[p];
    if (!n?.label) continue;
    PROJECT_LABEL[p] = n.label;
    PROJECT_SHORT[p] = n.short ?? n.label;
  }
}

export interface Step {
  text: string;
  done?: boolean;
}

export interface Todo {
  id: string;
  title: string;
  project: Project;
  kind: 'task' | 'idea';
  steps: Step[];
  minutes?: number;
  due?: ISODate;
  /** Pinned to the "Aujourd'hui" list of this date. */
  day?: ISODate;
  doneAt?: number;
  noteId?: string;
  createdAt: number;
  updatedAt: number;
}

export type NoteStatus = 'pending' | 'done' | 'error';

export interface Note {
  id: string;
  text: string;
  at: number;
  date: ISODate;
  source: 'app' | 'raccourci';
  status: NoteStatus;
  error?: string;
  summary?: string;
  made?: string[];
  updatedAt: number;
}

export interface WorkBlock {
  project: Project;
  start: number;
  end?: number;
  /** A block he told about ("j'ai bossé 2 h") rather than timed. */
  minutes?: number;
  source: 'lockin' | 'dicte';
}

export interface WorkDay {
  date: ISODate;
  blocks: WorkBlock[];
  updatedAt: number;
}

export interface Pulse {
  at: number;
  energy?: number;
  mood?: number;
  focus?: number;
}

/** What Claude returns for one note. Fields are in French, as the prompt asks. */
export interface BrainOut {
  resume: string;
  taches: { titre: string; projet: Project; etapes: string[]; minutes: number | null; echeance: string | null; aujourdhui: boolean }[];
  idees: { titre: string; projet: Project }[];
  forme: { energie: number | null; humeur: number | null; concentration: number | null };
  travail: { projet: Project; minutes: number }[];
  faits: string[];
  terminees: string[];
}

const MIN = 60_000;

export const isProject = (x: unknown): x is Project => typeof x === 'string' && (PROJECTS as string[]).includes(x);

const score = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(10, Math.max(1, Math.round(n))) : undefined);

const isoOrUndefined = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

const clean = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[.。]+$/, '');

export interface Applied {
  todos: Todo[];
  doneIds: string[];
  pulse?: Pulse;
  facts: string[];
  blocks: WorkBlock[];
  made: string[];
}

/** Turns Claude's answer into app records. Pure: the store saves them. */
export function applyBrain(note: Note, out: BrainOut, open: Pick<Todo, 'id'>[], now: number, today: ISODate): Applied {
  const todos: Todo[] = [];
  const made: string[] = [];
  let i = 0;
  const id = () => `t-${now.toString(36)}-${i++}`;
  for (const t of out.taches ?? []) {
    const title = clean(t.titre ?? '');
    if (!title) continue;
    const due = isoOrUndefined(t.echeance);
    todos.push({
      id: id(),
      title,
      project: isProject(t.projet) ? t.projet : 'perso',
      kind: 'task',
      steps: (t.etapes ?? []).map(clean).filter(Boolean).slice(0, 6).map((text) => ({ text })),
      minutes: typeof t.minutes === 'number' && t.minutes > 0 ? Math.round(t.minutes) : undefined,
      due,
      day: t.aujourdhui || due === today ? today : undefined,
      noteId: note.id,
      createdAt: now,
      updatedAt: now,
    });
    made.push(`Tâche : ${title}`);
  }
  for (const idea of out.idees ?? []) {
    const title = clean(idea.titre ?? '');
    if (!title) continue;
    todos.push({ id: id(), title, project: isProject(idea.projet) ? idea.projet : 'perso', kind: 'idea', steps: [], noteId: note.id, createdAt: now, updatedAt: now });
    made.push(`Idée : ${title}`);
  }
  const known = new Set(open.map((t) => t.id));
  const doneIds = (out.terminees ?? []).filter((x) => known.has(x));
  if (doneIds.length) made.push(`${doneIds.length} ${doneIds.length > 1 ? 'tâches cochées' : 'tâche cochée'}`);

  const energy = score(out.forme?.energie);
  const mood = score(out.forme?.humeur);
  const focus = score(out.forme?.concentration);
  const pulse = energy || mood || focus ? { at: note.at, energy, mood, focus } : undefined;
  if (pulse) made.push(['Forme', energy ? `énergie ${energy}/10` : '', mood ? `humeur ${mood}/10` : '', focus ? `concentration ${focus}/10` : ''].filter(Boolean).join(' · '));

  const blocks: WorkBlock[] = [];
  for (const w of out.travail ?? []) {
    const minutes = Math.round(w.minutes ?? 0);
    if (!isProject(w.projet) || minutes <= 0 || minutes > 16 * 60) continue;
    blocks.push({ project: w.projet, start: note.at - minutes * MIN, end: note.at, minutes, source: 'dicte' });
    made.push(`Travail : ${PROJECT_SHORT[w.projet]}, ${formatMinutes(minutes)}`);
  }
  const facts = (out.faits ?? []).map(clean).filter(Boolean).slice(0, 8);
  facts.forEach((f) => made.push(f));
  return { todos, doneIds, pulse, facts, blocks, made };
}

/** "Aujourd'hui": pinned to today, due today or late, then what he finished today. */
export function todayList(todos: Todo[], today: ISODate, startOfToday: number): Todo[] {
  const tasks = todos.filter((t) => t.kind === 'task');
  const open = tasks.filter((t) => !t.doneAt && (t.day === today || (t.due !== undefined && t.due <= today)));
  const done = tasks.filter((t) => t.doneAt && t.doneAt >= startOfToday && (t.day === today || (t.due !== undefined && t.due <= today)));
  const byDue = (a: Todo, b: Todo) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt - b.createdAt;
  return [...open.sort(byDue), ...done.sort((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0))];
}

export function byProject(todos: Todo[], kind: Todo['kind'], exclude: Set<string>): Record<Project, Todo[]> {
  const out = { biz: [], ecole: [], salle: [], perso: [] } as Record<Project, Todo[]>;
  for (const t of todos) {
    if (t.kind !== kind || t.doneAt || exclude.has(t.id)) continue;
    out[t.project].push(t);
  }
  for (const p of PROJECTS) out[p].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || b.createdAt - a.createdAt);
  return out;
}

export function blockMinutes(b: WorkBlock, now: number): number {
  if (b.minutes !== undefined) return b.minutes;
  return Math.max(0, Math.round(((b.end ?? now) - b.start) / MIN));
}

export function workMinutes(day: WorkDay | undefined, now: number): { total: number; by: Record<Project, number> } {
  const by = { biz: 0, ecole: 0, salle: 0, perso: 0 } as Record<Project, number>;
  for (const b of day?.blocks ?? []) by[b.project] += blockMinutes(b, now);
  return { total: by.biz + by.ecole + by.salle + by.perso, by };
}

export function runningBlock(work: Record<ISODate, WorkDay>, today: ISODate): { date: ISODate; index: number; block: WorkBlock } | null {
  for (const date of [today, addDays(today, -1)]) {
    const blocks = work[date]?.blocks ?? [];
    const index = blocks.findIndex((b) => b.source === 'lockin' && b.end === undefined);
    if (index >= 0) return { date, index, block: blocks[index] };
  }
  return null;
}

export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

/** 42:18 or 1:05:09, for the running timer. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** A note dropped by the iPhone shortcut carries an ISO time and no number: make it a full note. */
export function normalizeNote(raw: Partial<Note> & { iso?: string }, id: string): Note {
  const at = typeof raw.at === 'number' ? raw.at : raw.iso ? Date.parse(raw.iso) || Date.now() : Date.now();
  const text = String(raw.text ?? '').trim();
  const date = raw.date && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : new Date(at).toISOString().slice(0, 10);
  const base: Note = {
    id: raw.id || id,
    text,
    at,
    date,
    source: raw.source === 'raccourci' ? 'raccourci' : 'app',
    status: raw.status === 'done' || raw.status === 'error' ? raw.status : 'pending',
    error: raw.error,
    summary: raw.summary,
    made: raw.made,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : at,
  };
  return text ? base : { ...base, status: 'done', summary: 'Note vide.' };
}
