import { route, json, body, limit, requireUser, checkUsername, checkPassword, hashPassword, verifyPassword, claim, putUser, redis, startSession, endSession, publicUser, HttpError } from './_lib.js';

async function confirmed(req) {
  const b = await body(req), user = await requireUser(req);
  await limit('account:' + user.id, 20, 3600);
  if (user.pass && !(await verifyPassword(b.current ?? '', user.pass))) throw new HttpError(403, 'Your current password is wrong.');
  return { b, user };
}

// Adds or changes the username and password. Other devices are signed out.
export const POST = route(async req => {
  const { b, user } = await confirmed(req), username = checkUsername(b.username), password = checkPassword(b.password);
  const old = user.username?.toLowerCase(), name = username.toLowerCase();
  if (name !== old && !(await claim('name:' + name, user.id))) throw new HttpError(409, 'That username is taken.');
  Object.assign(user, { username, pass: await hashPassword(password), gen: (user.gen || 0) + 1 });
  await putUser(user);
  if (old && old !== name) await redis('DEL', 'name:' + old);
  return json({ user: publicUser(user) }, 200, [await startSession(req, user)]);
});

// Deletes the account and everything synced to it.
export const DELETE = route(async req => {
  const { user } = await confirmed(req), keys = ['user:' + user.id, 'data:' + user.id];
  if (user.username) keys.push('name:' + user.username.toLowerCase());
  if (user.wca) keys.push('wca:' + user.wca.userId);
  const cleared = await endSession(req);
  await redis('DEL', ...keys);
  return json({ ok: true }, 200, [cleared]);
});
