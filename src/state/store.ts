import { useSyncExternalStore } from 'react';
import type { DayLog, PlannedSession, Profile, SessionLog } from '../core/types';
import { todayISO, type ISODate } from '../core/dates';
import { createSession } from '../core/session';
import { healthPatch, parseHealthExport } from '../core/health';
import { applyBrain, runningBlock, type Note, type Project, type Todo, type WorkDay } from '../core/head';
import { dispatch, GhError, listFiles, readText, removeFile, writeText, type GhConfig, type GhFile } from './github';

export interface AppData {
  profile: Profile | null;
  days: Record<ISODate, DayLog>;
  sessions: Record<string, SessionLog>;
  notes: Record<string, Note>;
  todos: Record<string, Todo>;
  work: Record<ISODate, WorkDay>;
}

export type SyncStatus = 'connecting' | 'synced' | 'saving' | 'offline' | 'local' | 'denied';

interface Runtime {
  data: AppData;
  sync: SyncStatus;
  loaded: boolean;
  /** Last time the iPhone sent Health numbers. */
  healthAt: number | null;
  /** Notes Claude is sorting right now. */
  sorting: string[];
}

const KEY = 'fonte.v1';
const DIRTY_KEY = 'fonte.dirty.v1';
const TOKEN_KEY = 'fonte.token.v1';
const SHA_KEY = 'fonte.sha.v1';
const HEALTH_KEY = 'fonte.health.v1';
const YAZIO_KEY = 'fonte.yazio.v1';
const YAZIO_EVERY = 20 * 60_000;
const YAZIO_DELAY = 75_000;

export const DATA_REPO = { owner: 'gbuquen44-dot', repo: 'fonte-data' };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readLocal(): AppData {
  const parsed = readJson<Partial<AppData>>(KEY, {});
  return { profile: parsed.profile ?? null, days: parsed.days ?? {}, sessions: parsed.sessions ?? {}, notes: parsed.notes ?? {}, todos: parsed.todos ?? {}, work: parsed.work ?? {} };
}

let state: Runtime = { data: readLocal(), sync: 'connecting', loaded: false, healthAt: readJson<number | null>(HEALTH_KEY, null), sorting: [] };
const listeners = new Set<() => void>();
const dirty = new Set<string>(readJson<string[]>(DIRTY_KEY, []));
const shas = new Map<string, string>(Object.entries(readJson<Record<string, string>>(SHA_KEY, {})));

function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state.data));
    localStorage.setItem(DIRTY_KEY, JSON.stringify([...dirty]));
    localStorage.setItem(SHA_KEY, JSON.stringify(Object.fromEntries(shas)));
    if (state.healthAt) localStorage.setItem(HEALTH_KEY, JSON.stringify(state.healthAt));
  } catch {
    /* the repository still holds the data */
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useApp<T>(select: (r: Runtime) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

export const getData = () => state.data;

function commit(data: AppData, paths: string[]) {
  state = { ...state, data };
  paths.forEach((p) => dirty.add(p));
  persist();
  emit();
  scheduleFlush();
}

export function updateDay(date: ISODate, patch: Partial<DayLog>) {
  const now = Date.now();
  const prev = state.data.days[date] ?? { date, updatedAt: now };
  const next = { ...prev, ...patch, date, updatedAt: now };
  commit({ ...state.data, days: { ...state.data.days, [date]: next } }, [`days/${date}`]);
}

export function saveSession(s: SessionLog) {
  commit({ ...state.data, sessions: { ...state.data.sessions, [s.id]: s } }, [`sessions/${s.id}`]);
}

export function deleteSession(id: string) {
  const sessions = { ...state.data.sessions };
  delete sessions[id];
  state = { ...state, data: { ...state.data, sessions } };
  dirty.delete(`sessions/${id}`);
  persist();
  emit();
  void removeRemote(`sessions/${id}`);
}

export function updateProfile(patch: Partial<Profile>) {
  if (!state.data.profile) return;
  const profile = { ...state.data.profile, ...patch, updatedAt: Date.now() };
  commit({ ...state.data, profile }, ['profile/main']);
}

export function setProfile(p: Profile) {
  commit({ ...state.data, profile: p }, []);
}

export function allSessions(): SessionLog[] {
  return Object.values(state.data.sessions);
}

export function doneSessions(d: AppData = state.data): SessionLog[] {
  return Object.values(d.sessions)
    .filter((s) => s.status === 'done')
    .sort((a, b) => a.startedAt - b.startedAt);
}

export function activeSession(d: AppData = state.data): SessionLog | undefined {
  return Object.values(d.sessions).find((s) => s.status === 'active');
}

const HOUR = 3_600_000;

/** A session untouched for hours was forgotten, not paused. */
export const isStale = (s: SessionLog, now = Date.now()) => now - s.updatedAt > 6 * HOUR;

/** An empty session left open would block the next one. */
function dropEmptySessions(now = Date.now()) {
  for (const s of Object.values(state.data.sessions)) {
    if (s.status === 'active' && !s.sets.length && now - s.updatedAt > HOUR) deleteSession(s.id);
  }
}

export function beginSession(p: PlannedSession, date: ISODate): SessionLog {
  const running = activeSession();
  if (running) return running;
  const now = Date.now();
  const s = createSession(p, date, `${date}-${p.key}-${now.toString(36)}`, now);
  saveSession(s);
  return s;
}

export function exportJson(): string {
  return JSON.stringify({ app: 'fonte', exportedAt: new Date().toISOString(), today: todayISO(), ...state.data }, null, 2);
}

export function importJson(text: string): boolean {
  try {
    const raw = JSON.parse(text);
    if (raw.app !== 'fonte') return false;
    const data: AppData = { profile: raw.profile ?? state.data.profile, days: raw.days ?? {}, sessions: raw.sessions ?? {}, notes: raw.notes ?? {}, todos: raw.todos ?? {}, work: raw.work ?? {} };
    const paths = [
      ...Object.keys(data.days).map((d) => `days/${d}`),
      ...Object.keys(data.sessions).map((s) => `sessions/${s}`),
      ...Object.keys(data.notes).map((s) => `notes/${s}`),
      ...Object.keys(data.todos).map((s) => `todos/${s}`),
      ...Object.keys(data.work).map((s) => `work/${s}`),
      'profile/main',
    ];
    commit(data, paths);
    return true;
  } catch {
    return false;
  }
}

/* Copy in the private repository. The app keeps working on its local copy and catches up when it can. */

let flushing = false;
let pulling = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let backoff = 2000;
let lastPull = 0;
let bound = false;

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function conn(): GhConfig | null {
  const token = getToken();
  return token ? { token, ...DATA_REPO } : null;
}

function setSync(sync: SyncStatus, loaded = state.loaded) {
  if (state.sync === sync && state.loaded === loaded) return;
  state = { ...state, sync, loaded };
  emit();
}

function scheduleFlush(delay = 6000) {
  if (!conn()) return;
  clearTimeout(timer);
  timer = setTimeout(() => void flush(), delay);
}

const fileOf = (path: string) => `${path}.json`;

function bodyOf(path: string): unknown {
  const [col, id] = path.split('/');
  const d = state.data;
  if (col === 'days') return d.days[id];
  if (col === 'sessions') return d.sessions[id];
  if (col === 'profile') return d.profile;
  if (col === 'notes') return d.notes[id];
  if (col === 'todos') return d.todos[id];
  if (col === 'work') return d.work[id];
  return null;
}

function failed(e: unknown) {
  if (e instanceof GhError && (e.status === 401 || e.status === 403 || e.status === 404)) {
    console.error('Accès refusé', e.status);
    setSync('denied', true);
    return;
  }
  setSync('offline', state.loaded || !!state.data.profile);
  backoff = Math.min(backoff * 2, 60_000);
  scheduleFlush(backoff);
}

export async function flush() {
  const c = conn();
  if (!c || flushing || !dirty.size) return;
  flushing = true;
  setSync('saving');
  try {
    for (const path of [...dirty]) {
      const body = bodyOf(path);
      const file = fileOf(path);
      if (body) shas.set(file, await writeText(c, file, JSON.stringify(body, null, 1), shas.get(file)));
      dirty.delete(path);
      persist();
    }
    backoff = 2000;
    setSync('synced');
  } catch (e) {
    failed(e);
  } finally {
    flushing = false;
  }
}

async function removeRemote(path: string) {
  const c = conn();
  if (!c) return;
  const file = fileOf(path);
  try {
    await removeFile(c, file, shas.get(file));
    shas.delete(file);
    persist();
  } catch {
    /* a leftover file is harmless */
  }
}

type Stamped = { updatedAt?: number };

function mergeDoc<T extends Stamped>(col: string, id: string, local: Record<string, T>, remote: T) {
  if (dirty.has(`${col}/${id}`)) return;
  const mine = local[id];
  if (!mine || (remote.updatedAt ?? 0) > (mine.updatedAt ?? 0)) local[id] = remote;
}

async function fetchAll<T>(items: T[], run: (x: T) => Promise<void>, width = 6) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(width, queue.length) }, async () => {
    while (queue.length) await run(queue.shift() as T);
  }));
}

/** Applies what the iPhone shortcut dropped in the inbox, then empties it. */
async function readInbox(c: GhConfig, files: GhFile[]) {
  const inbox = files.filter((f) => f.path.startsWith('health/inbox/') && f.path.endsWith('.txt')).sort((a, b) => a.path.localeCompare(b.path));
  if (!inbox.length) return;
  const texts = new Map<string, string>();
  await fetchAll(inbox, async (f) => void texts.set(f.path, await readText(c, f.sha)));
  const now = Date.now();
  const days = { ...state.data.days };
  const paths: string[] = [];
  for (const f of inbox) {
    for (const h of parseHealthExport(texts.get(f.path) ?? '')) {
      const patch = healthPatch(days[h.date], h, now);
      if (!patch) continue;
      days[h.date] = { ...days[h.date], ...patch, date: h.date, updatedAt: now };
      if (!paths.includes(`days/${h.date}`)) paths.push(`days/${h.date}`);
    }
  }
  state = { ...state, healthAt: now };
  commit({ ...state.data, days }, paths);
  await fetchAll(inbox, async (f) => {
    await removeFile(c, f.path, f.sha).catch(() => undefined);
  }, 1);
}

/** GitHub's schedule does not fire on this repository: opening the app asks for a fresh read of Yazio. */
async function askYazio(c: GhConfig) {
  if (Date.now() - readJson<number>(YAZIO_KEY, 0) < YAZIO_EVERY) return;
  try {
    localStorage.setItem(YAZIO_KEY, JSON.stringify(Date.now()));
    await dispatch(c, 'yazio');
    setTimeout(() => void pull(true), YAZIO_DELAY);
  } catch {
    /* the next opening asks again */
  }
}

export async function pull(force = false) {
  const c = conn();
  if (!c || pulling) return;
  if (!force && Date.now() - lastPull < 45_000) return;
  pulling = true;
  try {
    const files = await listFiles(c);
    lastPull = Date.now();
    const docs = files.filter((f) => /^(profile|days|sessions|notes|todos|work)\/[^/]+\.json$/.test(f.path) && shas.get(f.path) !== f.sha);
    const days = { ...state.data.days };
    const sessions = { ...state.data.sessions };
    const notes = { ...state.data.notes };
    const todos = { ...state.data.todos };
    const work = { ...state.data.work };
    let profile = state.data.profile;
    await fetchAll(docs, async (f) => {
      const parsed = JSON.parse(await readText(c, f.sha)) as Stamped;
      shas.set(f.path, f.sha);
      const [col, name] = f.path.split('/');
      const id = name.replace(/\.json$/, '');
      if (col === 'days') mergeDoc('days', id, days, parsed as DayLog);
      else if (col === 'sessions') mergeDoc('sessions', id, sessions, parsed as SessionLog);
      else if (col === 'notes') mergeDoc('notes', id, notes, parsed as Note);
      else if (col === 'todos') mergeDoc('todos', id, todos, parsed as Todo);
      else if (col === 'work') mergeDoc('work', id, work, parsed as WorkDay);
      else if (!dirty.has('profile/main') && (!profile || !profile.linked || (parsed.updatedAt ?? 0) > (profile.updatedAt ?? 0))) profile = { ...(parsed as Profile), linked: true };
    });
    state = { ...state, data: { profile, days, sessions, notes, todos, work } };
    persist();
    emit();
    dropEmptySessions();
    setSync(dirty.size ? 'saving' : 'synced', true);
    await readInbox(c, files);
    void askYazio(c);
    void sortPending();
    scheduleFlush(300);
  } catch (e) {
    failed(e);
  } finally {
    pulling = false;
  }
}

function bind() {
  if (bound) return;
  bound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void pull();
    else void flush();
  });
  window.addEventListener('online', () => {
    void pull(true);
    scheduleFlush(300);
  });
}

export async function connectCloud() {
  dropEmptySessions();
  if (!conn()) {
    setSync('local', true);
    return;
  }
  if (state.data.profile) setSync('connecting', true);
  bind();
  await pull(true);
}

/** Checks a token against the repository before keeping it. */
export async function connectToken(token: string): Promise<'ok' | 'denied' | 'network'> {
  const clean = token.trim();
  try {
    await listFiles({ token: clean, ...DATA_REPO });
  } catch (e) {
    return e instanceof GhError && e.status !== 0 ? 'denied' : 'network';
  }
  try {
    localStorage.setItem(TOKEN_KEY, clean);
  } catch {
    return 'denied';
  }
  if (!state.data.profile?.linked) dirty.delete('profile/main');
  setSync('connecting', false);
  await connectCloud();
  return 'ok';
}

export function disconnect() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to remove */
  }
  setSync('local', true);
}

export const syncState = () => ({ sync: state.sync, loaded: state.loaded, pending: dirty.size });

export function seedForPreview(p: Profile, days: Record<ISODate, DayLog>, sessions: Record<string, SessionLog> = {}, extra: Partial<Pick<AppData, 'notes' | 'todos' | 'work'>> = {}) {
  if (state.data.profile) return;
  state = { ...state, data: { ...state.data, profile: p, days: { ...days, ...state.data.days }, sessions: { ...sessions, ...state.data.sessions }, ...extra } };
  persist();
  emit();
}

/* Tête: notes, to-do and Lock-in. */

const CLAUDE_KEY = 'lockin.claude.v1';

export function getClaudeKey(): string | null {
  try {
    return localStorage.getItem(CLAUDE_KEY);
  } catch {
    return null;
  }
}

export function setClaudeKey(key: string | null) {
  try {
    if (key) localStorage.setItem(CLAUDE_KEY, key.trim());
    else localStorage.removeItem(CLAUDE_KEY);
  } catch {
    /* private mode: the key stays for this visit only */
  }
  emit();
  if (key) void sortPending();
}

export function saveTodo(t: Todo) {
  commit({ ...state.data, todos: { ...state.data.todos, [t.id]: { ...t, updatedAt: Date.now() } } }, [`todos/${t.id}`]);
}

export function patchTodo(id: string, patch: Partial<Todo>) {
  const t = state.data.todos[id];
  if (t) saveTodo({ ...t, ...patch });
}

export function removeTodo(id: string) {
  const todos = { ...state.data.todos };
  delete todos[id];
  state = { ...state, data: { ...state.data, todos } };
  dirty.delete(`todos/${id}`);
  persist();
  emit();
  void removeRemote(`todos/${id}`);
}

function saveNote(n: Note) {
  commit({ ...state.data, notes: { ...state.data.notes, [n.id]: { ...n, updatedAt: Date.now() } } }, [`notes/${n.id}`]);
}

export function addNote(text: string, source: Note['source'] = 'app'): Note {
  const now = Date.now();
  const note: Note = { id: `${todayISO()}-${now.toString(36)}`, text: text.trim(), at: now, date: todayISO(), source, status: 'pending', updatedAt: now };
  saveNote(note);
  void sortPending();
  return note;
}

export function retryNote(id: string) {
  const n = state.data.notes[id];
  if (!n) return;
  saveNote({ ...n, status: 'pending', error: undefined });
  void sortPending();
}

export function removeNote(id: string) {
  const notes = { ...state.data.notes };
  delete notes[id];
  state = { ...state, data: { ...state.data, notes } };
  dirty.delete(`notes/${id}`);
  persist();
  emit();
  void removeRemote(`notes/${id}`);
}

const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' });

const ERROR_TEXT: Record<string, string> = {
  cle: 'Ta clé Claude ne marche pas. Vérifie-la dans Réglages.',
  reseau: 'Pas de réseau. Je la range dès que ça revient.',
  limite: 'Claude est saturé pour l\'instant. Je réessaie tout seul.',
  refus: 'Claude n\'a pas voulu ranger cette note.',
  autre: 'Je n\'ai pas réussi à la ranger.',
};

let sortingNow = false;

/** Sorts every note still waiting, one at a time. Notes stay saved even when this fails. */
export async function sortPending() {
  const key = getClaudeKey();
  if (!key || sortingNow) return;
  const waiting = Object.values(state.data.notes).filter((n) => n.status === 'pending').sort((a, b) => a.at - b.at);
  if (!waiting.length) return;
  sortingNow = true;
  try {
    const { sortWithClaude, SortError } = await import('./brain');
    for (const note of waiting) {
      state = { ...state, sorting: [...state.sorting, note.id] };
      emit();
      const open = Object.values(state.data.todos).filter((t) => t.kind === 'task' && !t.doneAt);
      try {
        const out = await sortWithClaude(key, note, {
          today: note.date,
          weekday: WEEKDAY.format(new Date(note.at)),
          about: state.data.profile?.about,
          open: open.map((t) => ({ id: t.id, title: t.title })),
        });
        applyNote(note, out, open);
      } catch (e) {
        const kind = e instanceof SortError ? e.kind : 'autre';
        const fresh = state.data.notes[note.id];
        if (fresh && kind !== 'reseau' && kind !== 'limite') saveNote({ ...fresh, status: 'error', error: ERROR_TEXT[kind] });
        if (kind === 'cle' || kind === 'reseau' || kind === 'limite') break;
      } finally {
        state = { ...state, sorting: state.sorting.filter((x) => x !== note.id) };
        emit();
      }
    }
  } finally {
    sortingNow = false;
  }
}

function applyNote(note: Note, out: import('../core/head').BrainOut, open: Todo[]) {
  const now = Date.now();
  const r = applyBrain(note, out, open, now, note.date);
  const d = state.data;
  const todos = { ...d.todos };
  const paths: string[] = [`notes/${note.id}`];
  for (const t of r.todos) {
    todos[t.id] = t;
    paths.push(`todos/${t.id}`);
  }
  for (const id of r.doneIds) {
    if (!todos[id]) continue;
    todos[id] = { ...todos[id], doneAt: now, updatedAt: now };
    paths.push(`todos/${id}`);
  }
  const days = { ...d.days };
  if (r.pulse || r.facts.length) {
    const prev = days[note.date] ?? { date: note.date, updatedAt: now };
    days[note.date] = {
      ...prev,
      pulses: r.pulse ? [...(prev.pulses ?? []), r.pulse] : prev.pulses,
      facts: r.facts.length ? [...(prev.facts ?? []), ...r.facts.map((text) => ({ at: note.at, text }))] : prev.facts,
      updatedAt: now,
    };
    paths.push(`days/${note.date}`);
  }
  const work = { ...d.work };
  if (r.blocks.length) {
    const prev = work[note.date] ?? { date: note.date, blocks: [], updatedAt: now };
    work[note.date] = { ...prev, blocks: [...prev.blocks, ...r.blocks], updatedAt: now };
    paths.push(`work/${note.date}`);
  }
  const notes = { ...d.notes, [note.id]: { ...(d.notes[note.id] ?? note), status: 'done' as const, error: undefined, summary: out.resume, made: r.made, updatedAt: now } };
  commit({ ...d, notes, todos, days, work }, paths);
}

export function startLock(project: Project) {
  stopLock();
  const now = Date.now();
  const date = todayISO();
  const prev = state.data.work[date] ?? { date, blocks: [], updatedAt: now };
  const next: WorkDay = { ...prev, blocks: [...prev.blocks, { project, start: now, source: 'lockin' }], updatedAt: now };
  commit({ ...state.data, work: { ...state.data.work, [date]: next } }, [`work/${date}`]);
}

export function stopLock() {
  const run = runningBlock(state.data.work, todayISO());
  if (!run) return;
  const now = Date.now();
  const day = state.data.work[run.date];
  const blocks = day.blocks.map((b, i) => (i === run.index ? { ...b, end: now } : b));
  commit({ ...state.data, work: { ...state.data.work, [run.date]: { ...day, blocks, updatedAt: now } } }, [`work/${run.date}`]);
}
