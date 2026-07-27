# In-Page Design Mode — Design Spec

Date: 2026-07-26
Status: Approved (pre-implementation)

## Overview

LootOps (`index.html`) is a single-file, no-build app. This spec adds an optional, developer-only "design mode" directly into that file: a toggle that lets the app's owner click any element in the running app, edit its text/color/spacing/font/border visually, and save those changes straight back into `index.html` on disk. It exists purely to speed up visual iteration on the app's own styling — it is not a feature for the app's end users (org members rolling loot).

## Goals

- Click any element in the running app and edit, live: text content, background/text/border color, margin/padding/gap, font-size/font-weight, border-width/style/color/radius.
- Per edit, when the touched property comes from a shared CSS class, ask whether to scope the change to just that element or to the whole class.
- Save queued edits directly to `index.html` on disk, with no copy/paste round-trip.
- Never be reachable by, or visible to, real end users of the deployed app.

## Non-goals (out of scope for this spec)

- Any editing capability when the app is opened via `file://` or hosted anywhere other than `localhost` — design mode is entirely absent there, not degraded.
- Persisting changes in non-Chrome/non-Chromium browsers (no fallback save path is built; live preview still works, saving does not).
- Editing text content on elements that contain other elements (nested markup) — text editing is limited to leaf elements with no element children.
- Real-time protection against the on-disk file changing underneath an open design-mode session (e.g. Claude editing `index.html` concurrently) beyond detecting it at save time and refusing to write. No file-watcher/live-diff UI.
- Layout/structural edits (reordering, adding/removing elements, changing element type). Design mode edits existing elements' style and text only.
- Any build step, bundler, or new dependency. Everything ships inside `index.html` and is served with a stock static file server.

## Usage workflow

Normal use of LootOps (opening/hosting `index.html` for actual loot rolls) is unaffected — nothing changes there.

To use design mode:

1. Serve the project folder locally, e.g. `python -m http.server 8000` (any static server works; this one needs no install).
2. Open `http://localhost:8000` in Chrome. (Required: Chrome's File System Access API — used for direct disk saves — only works in secure contexts, i.e. `https:` or `localhost`, never `file://`.)
3. Press `Ctrl+Shift+E` to toggle design mode on.
4. Click an element to select it; the inspector panel shows its editable properties pre-filled with current values. Adjust them; changes apply live.
5. If a property is governed by a shared class, choose "this element only" or "all `.classname`" when prompted.
6. Click "Save" — first time, grant the page permission to write `index.html`; every subsequent Save in the session reuses that permission.
7. Stop the server when done. `index.html` now has the changes baked in, ready to be hosted/opened normally.

## Architecture

All design-mode code lives inside `index.html`, as a single self-contained block near the end of the existing `<script>`, under a `DesignMode` namespace. On page load, it checks `location.hostname === 'localhost' || location.hostname === '127.0.0.1'`; only if that passes does it register the `Ctrl+Shift+E` listener. On any other host, the code is present but wires up nothing — no listener, no DOM, no visual trace.

While active, five pieces cooperate:

- **Highlighter/selector** — outlines whatever element is under the cursor (skipping design mode's own overlay elements); click locks in the selection.
- **Inspector panel** — a floating panel showing editable fields for the selected element, pre-filled with current values.
- **Scope resolver** — prompts "this element only" vs. "all `.classname` (N elements)" when an edited property is class-governed; waits for an explicit choice, no auto-timeout.
- **Change log** — an in-memory, ordered list of pending edits. Each edit is live-applied to the DOM immediately. `Ctrl+Z` pops and reverts the most recent entry.
- **File connector** — owns the `FileSystemFileHandle` (acquired via `showOpenFilePicker()` on first Save) and performs the actual read-patch-write cycle.

## Components

- `DesignMode.init()` — gate check + keyboard listener registration. The only code that always runs.
- `DesignMode.enable()` / `disable()` — mount/unmount overlay DOM and listeners. On `disable()` with a non-empty change log, confirm ("Discard N unsaved change(s)?") before tearing down.
- `DesignMode.selectElement(el)` — draws the highlight, reads current computed styles/text, populates the inspector. Disables the text field unless `el` has no element children.
- `DesignMode.applyEdit(el, property, value)` — applies the change to the live DOM (`el.style.setProperty(...)` or text update), determines if `property` is class-governed for `el`, invokes the scope resolver if so, and appends a resolved entry `{ type: 'style'|'text', dmId, className?, property, value, previousValue }` to the change log.
- `DesignMode.undo()` — pops the last change log entry, reverts that specific DOM mutation.
- `DesignMode.connectFile()` — calls `showOpenFilePicker()` scoped to `.html`, stores the handle for the session. Warns (non-blocking) if the picked file's name isn't `index.html`.
- `DesignMode.save()` — re-reads the file's current on-disk text via the stored handle, applies every queued change as a text patch (see below), writes the result back via a `FileSystemWritableFileStream`, clears the change log, shows a "Saved ✓" toast.
- Patch helpers (pure functions operating on file text, not the live DOM):
  - `patchStyleRule(cssText, selector, propsObject)` — finds/updates a declaration block for `selector` inside the `<style>` block's text (class-wide edits).
  - `patchElementStyleAttr(htmlText, dmId, propsObject)` — finds the tag with matching `id`/`data-dm-id` and merges into its `style="..."` attribute (element-only edits).
  - `patchElementText(htmlText, dmId, newText)` — finds the tag with matching `id`/`data-dm-id` and replaces its inner text.

### Stable element identification

Element-only edits need a way to find the same element again in the raw HTML text on save. Elements that already have an `id` use it as-is. Elements without one are assigned `data-dm-id="dm-N"` the first time they're edited — set live on the DOM node *and* included in the patch written to disk — so the identifier survives reloads and later editing sessions.

## Data flow — click to saved file

1. Toggle on (`Ctrl+Shift+E`) → overlay mounts, hover-highlighting starts.
2. Click an element → inspector populates from current values; text field enabled only for childless elements.
3. Adjust a field → live DOM update immediately; if class-governed, scope prompt appears next to the inspector and blocks that field's resolution until answered; resolved entry pushed to the change log.
4. Repeat across elements/properties — all live-previewed continuously, all queued.
5. `Ctrl+Z` reverts the most recent entry only.
6. Save: acquire file handle if not already held → read fresh file text from disk → apply all queued patches in order → write → clear change log → toast.
7. Exit with unsaved changes → confirm before discarding.

## Error handling

- **No File System Access API** (non-Chrome, or served over `file://`/non-localhost — though in the latter cases design mode won't have activated at all): inspector still works for live preview; Save is visibly disabled with an inline note explaining why. No fallback save path is implemented.
- **Picked file isn't named `index.html`**: warn, but proceed — the user may have a legitimate reason.
- **Save-time patch failure** (most likely cause: the on-disk file changed since design mode last read it, e.g. Claude Code edited it directly while the session was open): abort the entire write — never write a partial patch — surface an error toast ("File changed on disk — reload the page and redo from here"), and keep the change log intact so nothing queued is lost.
- **Concurrency rule**: design-mode sessions and direct source edits (e.g. by Claude Code) to `index.html` should not overlap. Save or discard design-mode changes before requesting unrelated edits to the file, and reload the page after any external edit before trusting design mode's view of it again.

## Testing / verification

No build or automated test suite exists for this project; verification is manual, run against this checklist once implemented:

- [ ] Opened via `file://` or a non-localhost origin: `Ctrl+Shift+E` does nothing, no design-mode DOM exists.
- [ ] Opened via `http://localhost:PORT` in Chrome: toggle works; hover-highlight skips the overlay's own UI.
- [ ] Selecting a button, a panel, a list item, and a heading each populate the inspector correctly; text field is disabled on elements with children.
- [ ] Each property type (text, bg/text/border color, margin/padding/gap, font-size/weight, border/radius) live-previews correctly when edited.
- [ ] Scope prompt appears for class-governed edits; both "this element only" and "all `.class`" branches patch correctly and survive a full page reload after Save.
- [ ] Undo reverts exactly one edit.
- [ ] Save → reload page fresh → all changes present (read from disk, not memory).
- [ ] Externally modifying the file mid-session, then attempting Save, aborts cleanly with no partial/corrupted write.
