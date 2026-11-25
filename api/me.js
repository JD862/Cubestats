import { route, json, currentUser, publicUser } from './_lib.js';

// Who is signed in, and which sign-in methods this server has.
export const GET = route(async req => {
  const user = await currentUser(req);
  return json({ user: user ? publicUser(user) : null, ready: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL), wca: !!(process.env.WCA_CLIENT_ID && process.env.WCA_CLIENT_SECRET) });
});
