import { route, json, body, limit, ipOf, redis, getUser, verifyPassword, startSession, publicUser, HttpError } from './_lib.js';

export const POST = route(async req => {
  const b = await body(req), name = String(b.username ?? '').trim().toLowerCase().slice(0, 30);
  await limit('login-ip:' + ipOf(req), 30, 900);
  await limit('login-name:' + name + ':' + ipOf(req), 10, 900);
  const id = name && (await redis('GET', 'name:' + name)), user = id ? await getUser(id) : null;
  if (!(await verifyPassword(b.password ?? '', user?.pass))) throw new HttpError(401, 'Wrong username or password.');
  return json({ user: publicUser(user) }, 200, [await startSession(req, user)]);
});
