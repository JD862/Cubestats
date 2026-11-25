# Cubestats
A way to track cubing growth and activity

## Use
Open `index.html` in a browser. Nothing to install. It works offline, and your solves stay on your computer.

- Import any number of csTimer exports (`.txt`, `.json`, `.csv`), `.xlsx` workbooks or plain time lists, or paste times.
- Pick average sizes from the dropdown, or add your own. Drag on a line chart to zoom, double-click to reset.
- Import from WCA downloads official results by WCA ID. Set a session's event in the session manager (or with "WCA event") to see out of comp, in comp, or both. Needs internet.
- The session manager switches, renames, reorders, merges and removes sessions.
- Every average drops the fastest 5% and slowest 5% of its solves (rounded up).
- "DNF counts as" sets how DNFs affect averages: standard rules, removed, also removing the best time, or a fixed time.

The sidebar switches between **Statistics** and **Alg trainer**, which drills 3x3, 2x2, one-handed and blind alg groups or your own algs with setups, pictures, a timer, per-case stats and a difficulty index (1 to 10) to learn by.

`main.py` is the original Streamlit version.
