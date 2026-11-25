import { randomUUID } from 'node:crypto';
import { route, json, body, limit, ipOf, checkUsername, checkPassword, hashPassword, claim, putUser, redis, startSession, publicUser, HttpError } from './_lib.js';

export const POST = route(async req => {
  const b = await body(req), username = checkUsername(b.username), password = checkPassword(b.password);
  await limit('register:' + ipOf(req), 10, 3600);
  const user = { id: randomUUID(), username, gen: 0, created: Date.now(), pass: await hashPassword(password) };
  await putUser(user);
  if (!(await claim('name:' + username.toLowerCase(), user.id))) {
    await redis('DEL', 'user:' + user.id);
    throw new HttpError(409, 'That username is taken.');
  }
  return json({ user: publicUser(user) }, 201, [await startSession(req, user)]);
});
