# Share-card mockup

`share-card-mockup.html` is the approved visual reference for the "Share Result"
feature (download/copy a PNG of a roll result, styled like a Discord embed).

Open it directly in a browser — it's self-contained, no server needed.

## Status as of 2026-07-27

The mockup itself is approved. The in-app implementation (in `index.html`,
currently **uncommitted**) went through several iterations trying to match it —
Share button next to Roll, a Share modal, real data wiring, PNG export via
html2canvas, a fix for harvestable items' rarity (baked into the item name, e.g.
"Valakkar Pearl (Grade AAA)", not in type/grade/class), and a switch from stacked
rows to side-by-side columns for people who won multiple item types — but the
user was still not happy with the end result and asked to stop and restart the
implementation from scratch next session, using this mockup as the reference
rather than the current in-app code.

Before resuming: check `git diff index.html` to see what's currently there
(uncommitted), and confirm with the user whether to build on it or revert to a
clean slate first.
