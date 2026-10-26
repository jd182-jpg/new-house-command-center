// OneDrive through Microsoft Graph, signed in as Jackson's personal account. The refresh
// token lives in KV (ms_refresh_token) because Microsoft hands back a new one on each use.

export const ROOT = '2608-Montrose-Blvd';
// Folders the filer may create in addition to the ones already in ROOT.
export const NEW_FOLDERS = ['08 Warranties and Receipts', '09 Utilities and Services', '00 Inbox'];
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SIMPLE_LIMIT = 4 * 1024 * 1024;
const CHUNK = 320 * 1024 * 10; // upload sessions want multiples of 320 KiB

// ---------- Names and folders (pure) ----------

// Characters OneDrive rejects, plus anything that could climb out of ROOT.
export function safeName(name) {
  return String(name || '').replace(/[\\/:*?"<>|#%]+/g, '-').replace(/\s+/g, ' ').replace(/^[.\s-]+|[.\s]+$/g, '').slice(0, 120);
}

// A folder path under ROOT whose first part is an existing or allowed top folder.
// Anything else lands in 00 Inbox, so a bad guess never writes outside the house folder.
export function safeFolder(folder, topFolders) {
  const parts = String(folder || '').split('/').map(safeName).filter(Boolean).slice(0, 3);
  const allowed = [...topFolders, ...NEW_FOLDERS];
  if (!parts.length || !allowed.includes(parts[0])) return '00 Inbox';
  return parts.join('/');
}

// Keeps the original extension; the parser only proposes the readable part of the name.
export function fileNameFor(proposed, original) {
  const ext = (String(original || '').match(/\.[A-Za-z0-9]{1,6}$/) || [''])[0];
  let base = safeName(proposed) || safeName(String(original || '').replace(/\.[A-Za-z0-9]{1,6}$/, '')) || 'file';
  if (ext && base.toLowerCase().endsWith(ext.toLowerCase())) base = base.slice(0, -ext.length);
  return `${base}${ext}`;
}

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

// ---------- Graph calls ----------

export async function accessToken(env, fetchFn) {
  const cached = await env.KV.get('ms_access', 'json');
  if (cached && cached.exp > Date.now() + 60000) return cached.token;
  const refresh = await env.KV.get('ms_refresh_token');
  if (!refresh) throw new Error('OneDrive is not connected (no refresh token)');
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID, grant_type: 'refresh_token', refresh_token: refresh,
      scope: 'Files.ReadWrite offline_access User.Read',
    }),
  });
  const tok = await res.json();
  if (!res.ok) throw new Error(`OneDrive sign-in expired (${tok.error}). Run the sign-in again.`);
  if (tok.refresh_token) await env.KV.put('ms_refresh_token', tok.refresh_token);
  await env.KV.put('ms_access', JSON.stringify({ token: tok.access_token, exp: Date.now() + tok.expires_in * 1000 }), { expirationTtl: Math.max(60, tok.expires_in - 60) });
  return tok.access_token;
}

async function graph(env, fetchFn, path, init = {}) {
  const token = await accessToken(env, fetchFn);
  const res = await fetchFn(path.startsWith('http') ? path : `${GRAPH}${path}`, {
    ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (!res.ok && res.status !== 404) throw new Error(`OneDrive ${init.method || 'GET'} failed (${res.status})`);
  return res;
}

// Top-level folder names in ROOT, cached for a day.
export async function topFolders(env, fetchFn) {
  const cached = await env.KV.get('top_folders', 'json');
  if (cached) return cached;
  const res = await graph(env, fetchFn, `/me/drive/root:/${encodePath(ROOT)}:/children?$select=name,folder&$top=200`);
  const names = (await res.json()).value.filter((x) => x.folder).map((x) => x.name);
  await env.KV.put('top_folders', JSON.stringify(names), { expirationTtl: 86400 });
  return names;
}

// Uploads bytes to ROOT/folder/name, renaming on a clash. Returns what the app stores.
export async function upload(env, fetchFn, folder, name, bytes) {
  const path = `${ROOT}/${folder}/${name}`;
  let item;
  if (bytes.byteLength <= SIMPLE_LIMIT) {
    const res = await graph(env, fetchFn, `/me/drive/root:/${encodePath(path)}:/content?@microsoft.graph.conflictBehavior=rename`, {
      method: 'PUT', body: bytes, headers: { 'content-type': 'application/octet-stream' },
    });
    item = await res.json();
  } else {
    const session = await (await graph(env, fetchFn, `/me/drive/root:/${encodePath(path)}:/createUploadSession`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }),
    })).json();
    for (let start = 0; start < bytes.byteLength; start += CHUNK) {
      const end = Math.min(start + CHUNK, bytes.byteLength);
      // The upload URL is pre-authorized; sending the bearer token to it is an error.
      const res = await fetchFn(session.uploadUrl, {
        method: 'PUT', body: bytes.slice(start, end),
        headers: { 'content-range': `bytes ${start}-${end - 1}/${bytes.byteLength}` },
      });
      if (!res.ok) throw new Error(`OneDrive upload failed (${res.status})`);
      if (end === bytes.byteLength) item = await res.json();
    }
  }
  return { name: item.name, path: `${folder}/${item.name}`, webUrl: item.webUrl, driveId: item.id, size: item.size };
}

// Moves uploaded files to the OneDrive recycle bin (used by undo and failed saves).
export async function remove(env, fetchFn, driveIds) {
  for (const id of driveIds || []) {
    try { await graph(env, fetchFn, `/me/drive/items/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch (err) { console.error(err); }
  }
}
