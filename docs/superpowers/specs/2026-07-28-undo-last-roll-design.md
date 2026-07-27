# Undo Last Roll — Design

## Purpose

Let a user reverse the most recent roll (misclick recovery) without needing to touch Names/Items, since rolling never consumes or mutates those lists — it only appends to history, renders results, and optionally posts to Discord.

## State & persistence

- Each history entry (written by `logRoll`) gains a `postedToDiscord: boolean` field — true if that roll was actually posted to the configured Discord webhook at roll time.
- A new `localStorage` key, `rollcall_last_undone_v1` (`'true'`/`'false'`, default `false`), tracks whether the most recent roll has already been undone.
  - Reset to `false` every time `logRoll` runs.
  - Set to `true` when Undo completes.
  - Reset to `false` (or removed) when history is cleared via `clearHistoryBtn`.

`namesArr`/`itemsArr` are never touched by rolling and therefore never touched by undo.

## UI: button placement & visibility

- New button `#undoRollBtn`, placed immediately to the left of `#rollBtn`.
- Styled as a secondary/outline button (not competing with the gold primary Roll button).
- Label: undo glyph (↺) + "Undo last roll".
- Visibility rule (`updateUndoButtonVisibility()`):
  - Hidden if history is empty, or `rollcall_last_undone_v1` is `'true'`.
  - Visible + enabled otherwise, including immediately after a page reload.
- Called: once on page load (alongside the existing `renderHistory()` call), after every `logRoll`, and after a successful undo.

## Undo action behavior

On click:
1. Show `confirmModal('Undo the last roll? This removes it from history.', 'Undo last roll')`.
2. If confirmed:
   - `entries = loadHistory(); const entry = entries.pop(); saveHistory(entries);`
   - Set `rollcall_last_undone_v1 = 'true'`.
   - `renderHistory()`; if the history modal is open, also `renderHistoryModalList()`.
   - Clear live roll state unconditionally: `results.innerHTML = ''`, `lastRollResult = null`, disable/un-ready the Share button (mirrors the existing reset pattern at index.html:2143). No-op if the page was freshly loaded.
   - Call `updateUndoButtonVisibility()` to hide the button.
   - If `entry.postedToDiscord` is true, call `postUndoToDiscord(...)`.
3. If cancelled, nothing happens.

## Discord follow-up

New function `postUndoToDiscord(url, entry)`:
- Only called if `entry.postedToDiscord` was true.
- Uses whatever webhook URL/enabled state is currently configured (not necessarily identical to roll time — acceptable since webhook config rarely changes mid-session). Skip silently if no webhook URL is currently set.
- Posts one embed:
  - Title: `"Roll Undone"`
  - Color: `EMBED_COLOR_UNDO = 0xE8636A` (matches `--bad`), following the existing pattern of `EMBED_COLOR` (`--gold`) and `EMBED_COLOR_RESULTS` (`--violet`).
  - Fields: `Roll` → original title or `"Untitled Roll"`; `Originally Posted` → `entry.when`.
- Same try/catch network handling as `postRollToDiscord`, but failures are dropped silently (no `discordStatusEl` update) — a Discord notify failure shouldn't read as the undo itself failing.

## Edge cases

- No history → button already hidden; no extra guard needed.
- Older history entries predating this feature lack `postedToDiscord` → treated as falsy (no follow-up), same graceful-degradation pattern as `itemsSnapshot`.
- `clearHistoryBtn` also resets `rollcall_last_undone_v1` and hides the undo button.

## Out of scope

- Multi-level undo (only the single most recent roll, ever, until a new roll happens).
- Restoring Names/Items state (never mutated by rolling in the first place).
- Deleting/editing the original Discord message (webhooks can't reliably do this without a stored message ID; a follow-up notice was chosen instead).
