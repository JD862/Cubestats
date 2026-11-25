import { route, json, body, endSession } from './_lib.js';

export const POST = route(async req => {
  await body(req);
  return json({ ok: true }, 200, [await endSession(req)]);
});
