import { randomUUID } from 'node:crypto';
import { route, redirect, origin, same, cookie, readCookie, stateName, currentUser, getUser, putUser, claim, redis, startSession } from './_lib.js';
const WCA = 'https://www.worldcubeassociation.org';

// The WCA user for a one-time code, or null.
async function whoIs(code, redirectUri) {
  const res = await fetch(WCA + '/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'authorization_code', client_id: process.env.WCA_CLIENT_ID, client_secret: process.env.WCA_CLIENT_SECRET, code, redirect_uri: redirectUri }),
  });
  const access = res.ok ? (await res.json()).access_token : null;
  const me = access && (await fetch(WCA + '/api/v0/me', { headers: { authorization: `Bearer ${access}` } }));
  return me?.ok ? (await me.json()).me : null;
}

export const GET = route(async req => {
  const q = new URL(req.url).searchParams;
  const back = (result, extra = []) => redirect(`${origin(req)}/?signin=${result}`, [cookie(req, stateName(req), '', 0), ...extra]);
  const state = readCookie(req, stateName(req));
  if (!state || !q.get('state') || !same(state, q.get('state'))) return back('expired');
  if (!q.get('code')) return back('cancelled');
  const me = await whoIs(q.get('code'), origin(req) + '/api/wca-callback');
  if (!me?.id) return back('failed');

  const wca = { userId: me.id, wcaId: me.wca_id || null, name: String(me.name || '').slice(0, 100) }, key = 'wca:' + me.id;
  const owner = await redis('GET', key);
  let user = owner ? await getUser(owner) : null;
  const signedIn = await currentUser(req);
  if (signedIn) { // already signed in: connect this WCA account
    if (owner && owner !== signedIn.id) return back('taken');
    if (signedIn.wca && signedIn.wca.userId !== me.id) return back('other');
    if (!owner && !(await claim(key, signedIn.id))) return back('taken');
    signedIn.wca = wca;
    await putUser(signedIn);
    return back('linked');
  }
  if (!user) {
    user = { id: owner || randomUUID(), gen: 0, created: Date.now() };
    if (!owner && !(await claim(key, user.id))) return back('failed'); // two first sign-ins at once: try again
  }
  user.wca = wca;
  await putUser(user);
  return back('ok', [await startSession(req, user)]);
});
