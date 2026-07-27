# Undo Reason Picker — Design

## Purpose

Extend the existing undo-last-roll feature (`docs/superpowers/specs/2026-07-28-undo-last-roll-design.md`) so that undoing captures *why* the roll was undone, and surfaces that reason in the Discord follow-up embed. Also makes the undo button visually read as destructive (always red) rather than neutral.

## Modal markup & function

A new `#undoReasonOverlay` modal, structurally similar to the existing `#confirmOverlay` (`.modal-overlay` / `.modal-panel` wrapper; backdrop click and Escape both cancel it). It has two internal views, toggled via a class on the panel:

- **Reason-list view** (default): a message ("Undo the last roll?"), then four buttons stacked in rows, in this order:
  1. "Wrong / missing name"
  2. "Wrong / missing item"
  3. "Other"
  4. "Cancel"

  The first three are styled like `.confirm-ok` (always-red — matches the existing destructive-action convention documented at index.html:854-856). "Cancel" is styled like `.confirm-cancel` (muted).

- **Other view**: shown when "Other" is clicked. Contains a text input, a "Confirm" button, and a "Back" button (returns to the reason-list view). Pressing Enter in the input behaves the same as clicking Confirm.

New function `undoReasonModal(): Promise<string|null>`, mirroring `confirmModal`'s promise-based pattern:
- Resolves with `"Wrong / missing name"` or `"Wrong / missing item"` if either of those buttons is clicked.
- Resolves with the trimmed text input's value if "Other" → Confirm is used with non-empty text; resolves with the literal string `"Other"` if that text was left blank.
- Resolves with `null` if cancelled — via the Cancel button, Escape, or a backdrop click, from either view.
- Each open of the modal resets to the reason-list view (so a previous "Other" text entry doesn't leak into the next undo).

## Undo handler & Discord embed changes

In the `undoRollBtn` click handler, replace:
```js
if(!await confirmModal('Undo the last roll? This removes it from history.', 'Undo last roll')) return;
```
with:
```js
const reason = await undoReasonModal();
if(reason === null) return;
```
Everything else in the handler (popping the history entry, `saveHistory`, `setLastRollUndone(true)`, `renderHistory`, clearing live results/share state) is unchanged.

`postUndoToDiscord(url, entry, reason)` gains a third parameter. Its embed gains a new field, inserted between the existing "Roll" and "Originally Posted" fields:
```js
{ name: 'Reason', value: escDiscord(reason), inline: false }
```
The call site in the undo handler becomes `postUndoToDiscord(webhookUrl, entry, reason)`. The existing trigger condition (`entry.postedToDiscord` true, and a webhook URL currently configured) is unchanged — `reason` is purely additional payload, not a new gating condition.

## Red undo button styling

`#undoRollBtn` keeps its `ghost-btn` base class (font, padding, border-radius) but gets dedicated always-on red styling instead of the hover-only `.ghost-btn.danger` treatment used by Reset — matching the same always-red rationale already used for `.confirm-ok`:
```css
#undoRollBtn{border-color:var(--bad); color:var(--bad);}
#undoRollBtn:hover{background:rgba(232,99,106,0.12); color:var(--text);}
```
This is layered alongside the existing `#undoRollBtn{display:flex; align-items:center; gap:6px;}` and `#undoRollBtn.hidden{display:none;}` rules, which are unchanged.

## Edge cases

- Cancelling from the "Other" text view (Escape/backdrop) cancels the whole undo, same as cancelling from the reason-list view — no partial state left behind.
- Reason is resolved and available even when the roll wasn't posted to Discord; it's simply unused in that case (no new gating logic, no wasted work — resolving it is cheap and keeps the handler simple).
- Reopening the modal after a previous "Other" entry starts from the reason-list view with an empty text field, never resuming previous text.

## Out of scope

- Editing/deleting reasons after the fact, or storing them locally (they exist only to enrich the Discord embed for that single undo action).
- Changing `confirmModal()` itself — it remains a separate, simpler function for all its other call sites (Reset, Clear History, remove webhook, discard Design Mode changes).
