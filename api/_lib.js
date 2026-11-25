// Shared server code. Files starting with "_" are not turned into endpoints by Vercel.
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const env = process.env, hash = promisify(scrypt);
export const SESSION_DAYS = 30;

/* ---------- database (Upstash Redis over HTTPS) ---------- */
export async function redis(...command) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL, key = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !key) throw new HttpError(503, 'Sign-in is not set up on this server yet.');
  const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(command) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error('database: ' + (data.error || res.status));
  return data.result;
}

/* ---------- requests ---------- */
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
function reply(payload, status, headers, cookies) {
  const h = new Headers({ 'cache-control': 'no-store', ...headers });
  for (const c of cookies) h.append('set-cookie', c);
  return new Response(payload, { status, headers: h });
}
export const json = (data, status = 200, cookies = []) => reply(JSON.stringify(data), status, { 'content-type': 'application/json; charset=utf-8' }, cookies);
export const redirect = (to, cookies = []) => reply(null, 302, { location: to }, cookies);
export const origin = req => env.APP_URL?.replace(/\/+$/, '') || new URL(req.url).origin;
// Runs a handler, turning errors into JSON without leaking details.
export const route = fn => async req => {
  try { return await fn(req); } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong on the server.' }, 500);
  }
};
// For anything that changes state: same-site JSON only, which stops cross-site requests.
export async function body(req, limitTo = 16384) {
  const from = req.headers.get('origin');
  if (from !== origin(req) && from !== new URL(req.url).origin) throw new HttpError(403, 'This request came from another site.');
  if (!/^application\/json\b/i.test(req.headers.get('content-type') || '')) throw new HttpError(415, 'Expected JSON.');
  const text = await req.text();
  if (text.length > limitTo) throw new HttpError(413, 'That is too much data to sync.');
  let data;
  try { data = JSON.parse(text); } catch { throw new HttpError(400, 'Invalid JSON.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Invalid JSON.');
  return data;
}
export const ipOf = req => (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
export async function limit(name, max, seconds) {
  const key = 'rate:' + sha(name), n = await redis('INCR', key);
  if (n === 1) await redis('EXPIRE', key, String(seconds));
  if (n > max) throw new HttpError(429, 'Too many tries. Wait a while and try again.');
}

/* ---------- cookies and sessions ---------- */
export const sha = s => createHash('sha256').update(s).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export const same = (a, b) => timingSafeEqual(Buffer.from(sha(String(a))), Buffer.from(sha(String(b))));
const https = req => origin(req).startsWith('https:');
export const sessionName = req => (https(req) ? '__Host-cs_session' : 'cs_session');
export const stateName = req => (https(req) ? '__Host-cs_state' : 'cs_state');
export const cookie = (req, name, value, seconds) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${https(req) ? '; Secure' : ''}`;
export function readCookie(req, name) {
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
// Only a hash of the session token is stored, so the database alone cannot be used to sign in.
export async function startSession(req, user) {
  const t = token(), seconds = SESSION_DAYS * 86400;
  await redis('SET', 'session:' + sha(t), JSON.stringify({ uid: user.id, gen: user.gen || 0 }), 'EX', String(seconds));
  return cookie(req, sessionName(req), t, seconds);
}
export async function currentUser(req) {
  const t = readCookie(req, sessionName(req));
  if (!t) return null;
  const s = JSON.parse((await redis('GET', 'session:' + sha(t))) || 'null'), user = s && (await getUser(s.uid));
  return user && (user.gen || 0) === s.gen ? user : null; // a new password ends older sessions
}
export async function requireUser(req) {
  const user = await currentUser(req);
  if (!user) throw new HttpError(401, 'You are signed out.');
  return user;
}
export async function endSession(req) {
  const t = readCookie(req, sessionName(req));
  if (t) await redis('DEL', 'session:' + sha(t));
  return cookie(req, sessionName(req), '', 0);
}

/* ---------- users ---------- */
export const getUser = async id => JSON.parse((await redis('GET', 'user:' + id)) || 'null');
export const putUser = user => redis('SET', 'user:' + user.id, JSON.stringify(user));
export const publicUser = u => ({ id: u.id, username: u.username || null, hasPassword: !!u.pass, wca: u.wca ? { id: u.wca.wcaId, name: u.wca.name } : null });
// Reserves a name for a user; false when it is taken.
export const claim = async (key, id) => (await redis('SET', key, id, 'NX')) === 'OK';

export function checkUsername(v) {
  const name = typeof v === 'string' ? v.trim() : '';
  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(name)) throw new HttpError(400, 'Usernames are 3 to 30 letters, numbers, dots, dashes or underscores.');
  return name;
}
export function checkPassword(v) {
  if (typeof v !== 'string' || v.length < 10 || v.length > 200) throw new HttpError(400, 'Passwords need 10 to 200 characters.');
  return v;
}
const COST = { N: 32768, r: 8, p: 3, maxmem: 96 * 1024 * 1024 };
const digest = (password, salt) => hash(password.normalize('NFKC'), salt, 64, COST);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: (await digest(password, salt)).toString('hex') };
}
const DUMMY = { salt: '0'.repeat(32), hash: '0'.repeat(128) };
// Takes the same time whether or not the account exists.
export async function verifyPassword(password, pass) {
  const p = pass || DUMMY, got = await digest(String(password).slice(0, 200), p.salt);
  return timingSafeEqual(got, Buffer.from(p.hash, 'hex')) && !!pass;
}
