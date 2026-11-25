import { route, redirect, origin, token, cookie, stateName, HttpError } from './_lib.js';

// Sends the browser to the WCA to sign in. The random state ties the answer to this browser.
export const GET = route(async req => {
  const id = process.env.WCA_CLIENT_ID;
  if (!id || !process.env.WCA_CLIENT_SECRET) throw new HttpError(503, 'WCA sign-in is not set up on this server yet.');
  const state = token(), q = new URLSearchParams({ client_id: id, redirect_uri: origin(req) + '/api/wca-callback', response_type: 'code', scope: 'public', state });
  return redirect(`https://www.worldcubeassociation.org/oauth/authorize?${q}`, [cookie(req, stateName(req), state, 600)]);
});
