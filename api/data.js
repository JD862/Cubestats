import { route, json, body, limit, requireUser, redis, HttpError } from './_lib.js';
const MAX = 4_000_000; // Vercel accepts request bodies up to 4.5 MB

async function read(uid) {
  const [rev, blob] = await redis('HMGET', 'data:' + uid, 'rev', 'blob');
  return { rev: Number(rev || 0), blob: blob ?? null };
}
export const GET = route(async req => json(await read((await requireUser(req)).id)));

// Saves only when nothing newer was saved since the client last read; otherwise returns the newer data to merge.
const SAVE = `local c = redis.call('HGET', KEYS[1], 'rev') or '0'
if c ~= ARGV[1] then return 0 end
local n = tonumber(c) + 1
redis.call('HSET', KEYS[1], 'rev', tostring(n), 'blob', ARGV[2])
return n`;
export const PUT = route(async req => {
  const b = await body(req, MAX), user = await requireUser(req);
  if (!Number.isSafeInteger(b.rev) || b.rev < 0 || typeof b.blob !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(b.blob)) throw new HttpError(400, 'Invalid data.');
  await limit('data:' + user.id, 600, 3600);
  const rev = await redis('EVAL', SAVE, '1', 'data:' + user.id, String(b.rev), b.blob);
  return rev ? json({ rev }) : json(await read(user.id), 409);
});
