/** The private data repository, used as a small document store. */

export interface GhConfig {
  token: string;
  owner: string;
  repo: string;
}

export interface GhFile {
  path: string;
  sha: string;
}

export class GhError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const BASE = 'https://api.github.com';
const BRANCH = 'main';

async function call(c: GhConfig, path: string, init: RequestInit = {}, accept = 'application/vnd.github+json'): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/repos/${c.owner}/${c.repo}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: accept,
        Authorization: `Bearer ${c.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new GhError(0, 'network');
  }
  if (!res.ok) throw new GhError(res.status, await res.text().catch(() => ''));
  return res;
}

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Every file of the repository with its content hash, in one request. */
export async function listFiles(c: GhConfig): Promise<GhFile[]> {
  const res = await call(c, `/git/trees/${BRANCH}?recursive=1`);
  const body = (await res.json()) as { tree: { path: string; type: string; sha: string }[] };
  return body.tree.filter((t) => t.type === 'blob').map((t) => ({ path: t.path, sha: t.sha }));
}

export async function readText(c: GhConfig, sha: string): Promise<string> {
  const res = await call(c, `/git/blobs/${sha}`, {}, 'application/vnd.github.raw+json');
  return res.text();
}

async function currentSha(c: GhConfig, path: string): Promise<string | undefined> {
  try {
    const res = await call(c, `/contents/${encodePath(path)}?ref=${BRANCH}`);
    return ((await res.json()) as { sha: string }).sha;
  } catch (e) {
    if (e instanceof GhError && e.status === 404) return undefined;
    throw e;
  }
}

/** Writes a file and returns its new hash. A stale hash is refreshed once. */
export async function writeText(c: GhConfig, path: string, text: string, sha?: string): Promise<string> {
  const send = async (known?: string) => {
    const res = await call(c, `/contents/${encodePath(path)}`, {
      method: 'PUT',
      body: JSON.stringify({ message: `Maj ${path}`, content: toBase64(text), branch: BRANCH, ...(known ? { sha: known } : {}) }),
    });
    return ((await res.json()) as { content: { sha: string } }).content.sha;
  };
  try {
    return await send(sha);
  } catch (e) {
    if (e instanceof GhError && (e.status === 409 || e.status === 422)) return send(await currentSha(c, path));
    throw e;
  }
}

export async function removeFile(c: GhConfig, path: string, sha?: string): Promise<void> {
  const known = sha ?? (await currentSha(c, path));
  if (!known) return;
  await call(c, `/contents/${encodePath(path)}`, { method: 'DELETE', body: JSON.stringify({ message: `Suppr ${path}`, sha: known, branch: BRANCH }) });
}
