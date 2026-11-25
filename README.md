# Cubestats
A way to track cubing growth and activity

## Use
Open `index.html` in a browser. Nothing to install. It works offline, and your solves stay in your browser unless you sign in on the hosted site.

- Import any number of csTimer exports (`.txt`, `.json`, `.csv`), `.xlsx` workbooks or plain time lists, or paste times.
- Pick average sizes from the dropdown, or add your own. Drag on a line chart to zoom, double-click to reset.
- Import from WCA downloads official results by WCA ID. Set a session's event in the session manager (or with "WCA event") to see out of comp, in comp, or both. Needs internet.
- The session manager switches, renames, reorders, merges and removes sessions.
- Every average drops the fastest 5% and slowest 5% of its solves (rounded up).
- "DNF counts as" sets how DNFs affect averages: standard rules, removed, also removing the best time, or a fixed time.

The sidebar switches between **Statistics** and **Alg trainer**, which drills 3x3, 2x2, one-handed and blind alg groups or your own algs with setups, pictures, a timer, per-case stats and a difficulty index (1 to 10) to learn by. The Learnt set collects every case you have marked as learnt.

## Host on Vercel with sign-in and sync
1. On vercel.com, import this GitHub repository as a new project. Framework preset: Other. No build command.
2. In the project, open Storage and connect an Upstash Redis database. This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Choose a plan and turn eviction off so accounts are never dropped.
3. For WCA sign-in, create an application at worldcubeassociation.org/oauth/applications with the redirect URI `https://YOUR-SITE.vercel.app/api/wca-callback` and the `public` scope. Add its `WCA_CLIENT_ID` and `WCA_CLIENT_SECRET` to the project's environment variables.
4. Add `APP_URL` = `https://YOUR-SITE.vercel.app` for the Production environment, then redeploy.

Never commit these values. Without step 3, username and password sign-in still works.
