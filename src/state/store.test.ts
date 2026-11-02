import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Stored = { text: string; sha: string };

/** The few GitHub endpoints the store uses, on an in-memory repository. */
function fakeGitHub(seed: Record<string, unknown> = {}) {
  let n = 0;
  const files = new Map<string, Stored>();
  const put = (path: string, text: string) => {
    const sha = `sha${++n}`;
    files.set(path, { text, sha });
    return sha;
  };
  for (const [path, body] of Object.entries(seed)) put(path, typeof body === 'string' ? body : JSON.stringify(body));
  const state = { failNext: 0, writes: [] as string[], deletes: [] as string[], denied: false };
  const res = (status: number, body: unknown) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  const fetcher = async (url: string, init: RequestInit = {}) => {
    if (state.denied) return res(401, 'Bad credentials');
    if (state.failNext > 0) {
      state.failNext--;
      throw new TypeError('network');
    }
    const path = new URL(url).pathname.replace('/repos/gbuquen44-dot/fonte-data', '');
    const method = init.method ?? 'GET';
    if (path.startsWith('/git/trees/')) return res(200, { tree: [...files].map(([p, f]) => ({ path: p, type: 'blob', sha: f.sha })) });
    if (path.startsWith('/git/blobs/')) {
      const sha = path.split('/').pop();
      const f = [...files.values()].find((x) => x.sha === sha);
      return f ? res(200, f.text) : res(404, 'missing');
    }
    const file = decodeURIComponent(path.replace('/contents/', ''));
    const current = files.get(file);
    if (method === 'GET') return current ? res(200, { sha: current.sha }) : res(404, 'missing');
    const body = JSON.parse(init.body as string) as { content?: string; sha?: string };
    if (method === 'DELETE') {
      files.delete(file);
      state.deletes.push(file);
      return res(200, {});
    }
    if (current && body.sha !== current.sha) return res(409, 'sha mismatch');
    if (!current && body.sha) return res(422, 'sha not needed');
    state.writes.push(file);
    return res(200, { content: { sha: put(file, new TextDecoder().decode(Uint8Array.from(atob(body.content as string), (c) => c.charCodeAt(0)))) } });
  };
  return { files, state, put, fetcher, json: (p: string) => JSON.parse(files.get(p)?.text ?? 'null') };
}

const local = new Map<string, string>();

async function load(hub: ReturnType<typeof fakeGitHub> | null, token: string | null = 'jeton') {
  vi.resetModules();
  local.clear();
  if (token) local.set('fonte.token.v1', token);
  const g = globalThis as unknown as Record<string, unknown>;
  g.localStorage = { getItem: (k: string) => local.get(k) ?? null, setItem: (k: string, v: string) => void local.set(k, v), removeItem: (k: string) => void local.delete(k) };
  g.document = { addEventListener: () => undefined, visibilityState: 'visible' };
  g.window = { addEventListener: () => undefined };
  g.fetch = hub?.fetcher ?? (async () => { throw new TypeError('network'); });
  const store = await import('./store');
  await store.connectCloud();
  await vi.advanceTimersByTimeAsync(10);
  return store;
}

const PROFILE = { tm: { squat: 140, bench: 95, deadlift: 180 }, kcalPlan: [], updatedAt: 500 };

describe('copy in the repository', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('works alone without a token', async () => {
    const store = await load(null, null);
    expect(store.syncState()).toMatchObject({ sync: 'local', loaded: true });
  });

  it('loads the stored profile and days', async () => {
    const hub = fakeGitHub({ 'profile/main.json': PROFILE, 'days/2026-10-31.json': { date: '2026-10-31', weight: 72.4, updatedAt: 5 } });
    const store = await load(hub);
    expect(store.getData().profile?.tm.squat).toBe(140);
    expect(store.getData().days['2026-10-31'].weight).toBe(72.4);
    expect(store.syncState()).toMatchObject({ sync: 'synced', loaded: true });
  });

  it('saves a day after a short pause, once', async () => {
    const hub = fakeGitHub({ 'profile/main.json': PROFILE });
    const store = await load(hub);
    store.updateDay('2026-11-02', { weight: 72.9 });
    store.updateDay('2026-11-02', { sleepH: 7 });
    await vi.advanceTimersByTimeAsync(7000);
    expect(hub.json('days/2026-11-02.json')).toMatchObject({ weight: 72.9, sleepH: 7 });
    expect(hub.state.writes.filter((p) => p === 'days/2026-11-02.json')).toHaveLength(1);
    expect(store.syncState()).toMatchObject({ sync: 'synced', pending: 0 });
  });

  it('drops an empty session left open, not one with sets', async () => {
    const old = Date.now() - 2 * 3_600_000;
    const hub = fakeGitHub({
      'profile/main.json': PROFILE,
      'sessions/vide.json': { id: 'vide', status: 'active', sets: [], updatedAt: old },
      'sessions/pleine.json': { id: 'pleine', status: 'active', sets: [{ exId: 'squat' }], updatedAt: old },
    });
    const store = await load(hub);
    expect(Object.keys(store.getData().sessions)).toEqual(['pleine']);
    expect(hub.state.deletes).toContain('sessions/vide.json');
  });

  it('calls a session forgotten after 6 hours', async () => {
    const store = await load(null, null);
    const s = { updatedAt: 0 } as Parameters<typeof store.isStale>[0];
    expect(store.isStale(s, 5 * 3_600_000)).toBe(false);
    expect(store.isStale(s, 7 * 3_600_000)).toBe(true);
  });

  it('updates a file it already knows', async () => {
    const hub = fakeGitHub({ 'profile/main.json': PROFILE });
    const store = await load(hub);
    store.updateDay('2026-11-02', { weight: 72.9 });
    await vi.advanceTimersByTimeAsync(7000);
    store.updateDay('2026-11-02', { weight: 73.1 });
    await vi.advanceTimersByTimeAsync(7000);
    expect(hub.json('days/2026-11-02.json')).toMatchObject({ weight: 73.1 });
    expect(store.syncState().pending).toBe(0);
  });

  it('recovers from a stale file hash', async () => {
    const hub = fakeGitHub({ 'profile/main.json': PROFILE, 'days/2026-11-02.json': { date: '2026-11-02', weight: 70, updatedAt: 1 } });
    const store = await load(hub);
    hub.put('days/2026-11-02.json', JSON.stringify({ date: '2026-11-02', weight: 71, updatedAt: 2 }));
    store.updateDay('2026-11-02', { weight: 72 });
    await vi.advanceTimersByTimeAsync(7000);
    expect(hub.json('days/2026-11-02.json')).toMatchObject({ weight: 72 });
  });

  it('keeps the data and retries when the network drops', async () => {
    const hub = fakeGitHub({ 'profile/main.json': PROFILE });
    const store = await load(hub);
    hub.state.failNext = 2;
    store.updateDay('2026-11-02', { weight: 72 });
    await vi.advanceTimersByTimeAsync(7000);
    expect(store.syncState()).toMatchObject({ sync: 'offline', pending: 1 });
    expect(store.getData().days['2026-11-02'].weight).toBe(72);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(hub.json('days/2026-11-02.json')).toMatchObject({ weight: 72 });
    expect(store.syncState()).toMatchObject({ sync: 'synced', pending: 0 });
  });

  it('never overwrites a local entry with an older copy', async () => {
    const hub = fakeGitHub({ 'profile/main.json': PROFILE });
    const store = await load(hub);
    store.updateDay('2026-11-02', { weight: 72 });
    hub.put('days/2026-11-02.json', JSON.stringify({ date: '2026-11-02', weight: 60, updatedAt: 1 }));
    await store.pull(true);
    expect(store.getData().days['2026-11-02'].weight).toBe(72);
  });

  it('takes a newer copy from another device', async () => {
    const hub = fakeGitHub({ 'profile/main.json': PROFILE, 'days/2026-11-02.json': { date: '2026-11-02', weight: 72, updatedAt: 10 } });
    const store = await load(hub);
    hub.put('days/2026-11-02.json', JSON.stringify({ date: '2026-11-02', weight: 73, updatedAt: 20 }));
    await store.pull(true);
    expect(store.getData().days['2026-11-02'].weight).toBe(73);
  });

  it('does not offer a blank start while offline with a token', async () => {
    const hub = fakeGitHub();
    hub.state.failNext = 99;
    const store = await load(hub);
    expect(store.syncState()).toMatchObject({ sync: 'offline', loaded: false });
  });

  it('says so when the token stops working', async () => {
    const hub = fakeGitHub({ 'profile/main.json': PROFILE });
    hub.state.denied = true;
    const store = await load(hub);
    expect(store.syncState()).toMatchObject({ sync: 'denied', loaded: true });
  });

  it('rejects a bad token and keeps a good one', async () => {
    const hub = fakeGitHub({ 'profile/main.json': PROFILE });
    const store = await load(hub, null);
    hub.state.denied = true;
    expect(await store.connectToken('mauvais')).toBe('denied');
    expect(store.getToken()).toBeNull();
    hub.state.denied = false;
    expect(await store.connectToken(' bon ')).toBe('ok');
    expect(store.getToken()).toBe('bon');
  });

  it('replaces a phone-only profile with the saved one on first connection', async () => {
    const hub = fakeGitHub({ 'profile/main.json': PROFILE });
    const store = await load(hub, null);
    store.setProfile({ ...PROFILE, tm: { squat: 100, bench: 70, deadlift: 120 }, updatedAt: 9_000_000 } as never);
    store.updateProfile({ phase: 'prise' });
    expect(await store.connectToken('bon')).toBe('ok');
    await vi.advanceTimersByTimeAsync(10);
    expect(store.getData().profile?.tm.squat).toBe(140);
  });

  it('applies the Health inbox, keeps typed food and empties the inbox', async () => {
    const text = 'fonte-sante 1\nsteps\t2026-11-02\t8 432\nkcal\t2026-11-02\t1 985,4\nprotein\t2026-11-02\t141\nkcal\t2026-11-03\t500\nsteps\tbad\t1\n';
    const hub = fakeGitHub({ 'profile/main.json': PROFILE, 'days/2026-11-03.json': { date: '2026-11-03', kcal: 2100, manualFood: true, updatedAt: 3 }, 'health/inbox/2026-11-03-081500.txt': text });
    const store = await load(hub);
    await vi.advanceTimersByTimeAsync(10);
    expect(store.getData().days['2026-11-02']).toMatchObject({ steps: 8432, kcal: 1985, protein: 141 });
    expect(store.getData().days['2026-11-03'].kcal).toBe(2100);
    expect(hub.state.deletes).toContain('health/inbox/2026-11-03-081500.txt');
    await vi.advanceTimersByTimeAsync(7000);
    expect(hub.json('days/2026-11-02.json')).toMatchObject({ steps: 8432 });
  });
});
