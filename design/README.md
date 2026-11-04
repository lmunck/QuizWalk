# Design reference

These are the screen designs (exported design canvas) that v1 is built from. Open any `*.dc.html` in a browser.

- `canvas.json`: board layout, screen titles and the gap notes G1–G6.
- `Flow.dc.html`: overall app flow.
- Screen IDs used throughout `docs/v1-spec.md`: C1–C9 (creator), P1–P6 (participant), G1–G6 (gap proposals).

Notes:
- The export does not include `support.js`, so dynamic parts (`{{…}}`) and accent-coloured buttons don't render. The intended values are in each file's `<script>` block.
- The design predates the v1 decisions. Where the design and `docs/v1-spec.md` disagree, the spec wins: no App Clip or web play, no multi-phone teams, no countdown, etc.
