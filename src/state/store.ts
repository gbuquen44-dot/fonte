import { useSyncExternalStore } from 'react';
import type { DayLog, PlannedSession, Profile, SessionLog } from '../core/types';
import { todayISO, type ISODate } from '../core/dates';
import { createSession } from '../core/session';
import { healthPatch, parseHealthExport } from '../core/health';
import { GhError, listFiles, readText, removeFile, writeText, type GhConfig, type GhFile } from './github';

export interface AppData {
  profile: Profile | null;
  days: Record<ISODate, DayLog>;
  sessions: Record<string, SessionLog>;
}

export type SyncStatus = 'connecting' | 'synced' | 'saving' | 'offline' | 'local' | 'denied';

interface Runtime {
  data: AppData;
  sync: SyncStatus;
  loaded: boolean;
  /** Last time the iPhone sent Health numbers. */
  healthAt: number | null;
}

const KEY = 'fonte.v1';
const DIRTY_KEY = 'fonte.dirty.v1';
const TOKEN_KEY = 'fonte.token.v1';
const SHA_KEY = 'fonte.sha.v1';
const HEALTH_KEY = 'fonte.health.v1';

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
  return { profile: parsed.profile ?? null, days: parsed.days ?? {}, sessions: parsed.sessions ?? {} };
}

let state: Runtime = { data: readLocal(), sync: 'connecting', loaded: false, healthAt: readJson<number | null>(HEALTH_KEY, null) };
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
    const data: AppData = { profile: raw.profile ?? state.data.profile, days: raw.days ?? {}, sessions: raw.sessions ?? {} };
    const paths = [
      ...Object.keys(data.days).map((d) => `days/${d}`),
      ...Object.keys(data.sessions).map((s) => `sessions/${s}`),
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
  return col === 'days' ? d.days[id] : col === 'sessions' ? d.sessions[id] : col === 'profile' ? d.profile : null;
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

export async function pull(force = false) {
  const c = conn();
  if (!c || pulling) return;
  if (!force && Date.now() - lastPull < 45_000) return;
  pulling = true;
  try {
    const files = await listFiles(c);
    lastPull = Date.now();
    const docs = files.filter((f) => /^(profile|days|sessions)\/[^/]+\.json$/.test(f.path) && shas.get(f.path) !== f.sha);
    const days = { ...state.data.days };
    const sessions = { ...state.data.sessions };
    let profile = state.data.profile;
    await fetchAll(docs, async (f) => {
      const parsed = JSON.parse(await readText(c, f.sha)) as Stamped;
      shas.set(f.path, f.sha);
      const [col, name] = f.path.split('/');
      const id = name.replace(/\.json$/, '');
      if (col === 'days') mergeDoc('days', id, days, parsed as DayLog);
      else if (col === 'sessions') mergeDoc('sessions', id, sessions, parsed as SessionLog);
      else if (!dirty.has('profile/main') && (!profile || !profile.linked || (parsed.updatedAt ?? 0) > (profile.updatedAt ?? 0))) profile = { ...(parsed as Profile), linked: true };
    });
    state = { ...state, data: { profile, days, sessions } };
    persist();
    emit();
    setSync(dirty.size ? 'saving' : 'synced', true);
    await readInbox(c, files);
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

export function seedForPreview(p: Profile, days: Record<ISODate, DayLog>, sessions: Record<string, SessionLog> = {}) {
  if (state.data.profile) return;
  state = { ...state, data: { ...state.data, profile: p, days: { ...days, ...state.data.days }, sessions: { ...sessions, ...state.data.sessions } } };
  persist();
  emit();
}
