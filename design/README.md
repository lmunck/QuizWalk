# Design reference

These are the screen designs (exported design canvas) that v1 is built from. Open any `*.dc.html` in a browser.

- `canvas.json`: board layout, screen titles and the gap notes G1–G6.
- `Flow.dc.html`: overall app flow.
- Screen IDs used throughout `docs/v1-spec.md`: C1–C9 (creator), P1–P6 (participant), G1–G6 (gap proposals).

Notes:
- The export does not include `support.js`, so dynamic parts (`{{…}}`) and accent-coloured buttons don't render. The intended values are in each file's `<script>` block.
- The mockups were not redrawn after the UX review of 2026-11-24. Its changes (the Arrived step before each question, answer rows in C5, Share vs Open walk in C6, the Welcome choice, the walk menu, colour and size fixes) are described per screen in `docs/v1-spec.md` §3 and §14.
- The design predates the v1 decisions. Where the design and `docs/v1-spec.md` disagree, the spec wins: no App Clip or web play, no multi-phone teams, no countdown, etc.
