# Undo Last Roll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Undo last roll" button that removes the most recent roll from history, clears the live results/share state, and (if that roll was posted to Discord) sends a themed follow-up notice.

**Architecture:** Everything lives in the single file `index.html` (no build/test tooling — see Global Constraints). Adds one new `localStorage` flag, one new field on history entries, one new button + its click handler, and one new Discord embed function, following the existing patterns for history persistence and webhook posting already in the file.

**Tech Stack:** Vanilla JS, inline CSS, `localStorage`, Discord webhook `fetch` POST. No frameworks, no bundler, no automated test runner.

## Global Constraints

- Single file `index.html` only — no new files, no build step (per `CLAUDE.md`).
- There is no test suite. "Test" steps in this plan mean: open `index.html` in a browser (or a simple static server) and manually verify via the UI and DevTools (Elements/Console/Application → Local Storage), per `CLAUDE.md`'s "Working with the file" section.
- Do not touch `APP_VERSION` or add a changelog entry unless explicitly asked.
- Every `localStorage` read/write must be wrapped in `try/catch`, matching every existing helper (`loadHistory`, `saveHistory`, `loadWebhookUrl`, etc.).
- Follow the spec at `docs/superpowers/specs/2026-07-28-undo-last-roll-design.md` exactly; this plan implements it task-by-task.
- Reuse existing UI patterns instead of inventing new ones: the `.ghost-btn` class (index.html:99, already used by `#resetBtn` with the same ↺ glyph at index.html:1439) is the correct style for the new button — do not write bespoke button CSS.

---

### Task 1: History entry `postedToDiscord` field + `rollcall_last_undone_v1` flag

**Files:**
- Modify: `index.html` (history persistence block, ~line 2867-2989; roll handler, ~line 3318-3368)

**Interfaces:**
- Produces: `LAST_UNDONE_KEY` constant, `loadLastRollUndone(): boolean`, `setLastRollUndone(value: boolean): void` — used by Task 3 (visibility) and Task 4 (undo handler).
- Produces: `logRoll(names, buckets, leftover, title, when, itemsSnapshot, postedToDiscord)` — six-arg signature extended with a 7th `postedToDiscord` boolean; stores it on the entry and resets the undone flag. Used by the existing `rollBtn` handler (modified in this task) and read by Task 4's undo handler as `entry.postedToDiscord`.

- [ ] **Step 1: Add the flag helpers next to `HISTORY_KEY`**

In `index.html`, immediately after the `saveHistory` function (currently ending at line 2878, right before `const HISTORY_PREVIEW_COUNT = 2;`), add:

```js
const LAST_UNDONE_KEY = 'rollcall_last_undone_v1';

function loadLastRollUndone(){
  try{ return localStorage.getItem(LAST_UNDONE_KEY) === 'true'; }
  catch(e){ return false; }
}
function setLastRollUndone(value){
  try{ localStorage.setItem(LAST_UNDONE_KEY, String(!!value)); }catch(e){ /* storage unavailable, ignore */ }
}
```

- [ ] **Step 2: Extend `logRoll` to accept and store `postedToDiscord`, and reset the undone flag**

Find the existing `logRoll` function (index.html:2969-2982):

```js
function logRoll(names, buckets, leftover, title, when, itemsSnapshot){
  const entries = loadHistory();
  entries.push({
    when: when || new Date().toLocaleString(),
    title: title || '',
    names,
    buckets,
    leftover,
    itemsSnapshot: itemsSnapshot || []
  });
  saveHistory(entries);
  renderHistory();
  if(!historyOverlay.classList.contains('hidden')) renderHistoryModalList();
}
```

Replace it with:

```js
function logRoll(names, buckets, leftover, title, when, itemsSnapshot, postedToDiscord){
  const entries = loadHistory();
  entries.push({
    when: when || new Date().toLocaleString(),
    title: title || '',
    names,
    buckets,
    leftover,
    itemsSnapshot: itemsSnapshot || [],
    postedToDiscord: !!postedToDiscord
  });
  saveHistory(entries);
  setLastRollUndone(false);
  renderHistory();
  if(!historyOverlay.classList.contains('hidden')) renderHistoryModalList();
}
```

- [ ] **Step 3: Reorder the roll handler so `webhookUrl`/post decision is known before `logRoll` runs**

Find the `rollBtn` click handler's `setTimeout` body (index.html:3341-3367):

```js
  setTimeout(() => {
    const { buckets, leftover } = assign(names, items, evenSpread.checked, oneEach.checked);
    const when = new Date().toLocaleString();
    // Taken once, right here, so the result cards, the history entry, and the share
    // card all agree on exactly the same quality/SCU/category data for this roll.
    const itemsSnapshot = snapshotItemsForRoll();
    render(names, buckets, leftover, title, itemsSnapshot);
    logRoll(names, buckets, leftover, title, when, itemsSnapshot);
    rollBtn.disabled = false;

    lastRollResult = {
      title, when, names: names.slice(),
      buckets: buckets.map(b => b.slice()),
      itemsSnapshot
    };
    shareBtn.disabled = false;
    shareBtn.classList.add('ready');

    const webhookUrl = loadWebhookUrl();
    if(webhookUrl && discordEnabled.checked){
      postRollToDiscord(webhookUrl, {
        title, when, names, buckets, leftover,
        itemsSnapshot: itemsArr.map(it => ({ label: it.label || it.name, qty: it.qty })),
        spreadEven: evenSpread.checked, capOne: oneEach.checked
      });
    }
  }, 420);
```

Replace it with (moves `webhookUrl`/`willPostToDiscord` above `logRoll`, passes the flag through, and reuses `willPostToDiscord` in place of the old inline condition):

```js
  setTimeout(() => {
    const { buckets, leftover } = assign(names, items, evenSpread.checked, oneEach.checked);
    const when = new Date().toLocaleString();
    // Taken once, right here, so the result cards, the history entry, and the share
    // card all agree on exactly the same quality/SCU/category data for this roll.
    const itemsSnapshot = snapshotItemsForRoll();
    const webhookUrl = loadWebhookUrl();
    const willPostToDiscord = !!(webhookUrl && discordEnabled.checked);
    render(names, buckets, leftover, title, itemsSnapshot);
    logRoll(names, buckets, leftover, title, when, itemsSnapshot, willPostToDiscord);
    rollBtn.disabled = false;

    lastRollResult = {
      title, when, names: names.slice(),
      buckets: buckets.map(b => b.slice()),
      itemsSnapshot
    };
    shareBtn.disabled = false;
    shareBtn.classList.add('ready');

    if(willPostToDiscord){
      postRollToDiscord(webhookUrl, {
        title, when, names, buckets, leftover,
        itemsSnapshot: itemsArr.map(it => ({ label: it.label || it.name, qty: it.qty })),
        spreadEven: evenSpread.checked, capOne: oneEach.checked
      });
    }
  }, 420);
```

- [ ] **Step 4: Reset the undone flag when history is cleared**

Find the `clearHistoryBtn` handler (index.html:2984-2989):

```js
document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
  if(await confirmModal('Clear all saved roll history? This can\'t be undone.', 'Clear history')){
    saveHistory([]);
    renderHistory();
  }
});
```

Replace it with:

```js
document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
  if(await confirmModal('Clear all saved roll history? This can\'t be undone.', 'Clear history')){
    saveHistory([]);
    setLastRollUndone(false);
    renderHistory();
  }
});
```

- [ ] **Step 5: Manually verify**

Open `index.html` in a browser. Open DevTools → Application → Local Storage.
1. Add a name and an item, set a roll title, click Roll.
2. Confirm a new `rollcall_history_v1` entry was written and its last array element has `"postedToDiscord":false` (Discord wasn't configured/enabled).
3. Confirm `rollcall_last_undone_v1` is now `"false"`.
4. Open the history panel/modal and confirm the roll still displays normally (unaffected by the new field).
5. Click "Clear history", confirm the popup, and confirm both `rollcall_history_v1` is `"[]"` and `rollcall_last_undone_v1` is `"false"`.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: track postedToDiscord on history entries and add undo-flag storage"
```

---

### Task 2: Undo button markup and styling

**Files:**
- Modify: `index.html` (roll-row markup, ~line 1589-1599; CSS near `#rollBtn`, ~line 521-539)

**Interfaces:**
- Produces: `#undoRollBtn` DOM element (starts with class `ghost-btn hidden`) — read by Task 3 (visibility toggling) and Task 4 (click handler).

- [ ] **Step 1: Add the button to the markup**

Find the `.roll-row` div (index.html:1589-1599):

```html
  <div class="roll-row">
    <button id="rollBtn">Roll</button>
    <button id="shareBtn" type="button" disabled aria-label="Share result">
```

Replace the opening of that block with (inserting the new button before `#rollBtn`, keeping `#shareBtn` untouched):

```html
  <div class="roll-row">
    <button id="undoRollBtn" type="button" class="ghost-btn hidden">↺ Undo last roll</button>
    <button id="rollBtn">Roll</button>
    <button id="shareBtn" type="button" disabled aria-label="Share result">
```

- [ ] **Step 2: Add minimal supporting CSS**

Find the `#rollBtn:disabled` rule (index.html:539):

```css
  #rollBtn:disabled{opacity:.6; cursor:default; transform:none; box-shadow:none;}
```

Immediately after it, add:

```css
  #undoRollBtn{display:flex; align-items:center; gap:6px;}
  #undoRollBtn.hidden{display:none;}
```

- [ ] **Step 3: Manually verify**

Open `index.html` in a browser (button will be visible right now since Task 3's visibility logic doesn't exist yet — that's expected).
1. Confirm the button renders to the left of "Roll", styled like the existing ghost/outline buttons (e.g. `#resetBtn`), same height as the Roll/Share buttons (row uses `align-items:stretch`).
2. Confirm the ↺ glyph and "Undo last roll" text both render.
3. Resize to a narrow/mobile width and confirm the row doesn't visually break (wraps or stays usable).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add undo-last-roll button markup and styling"
```

---

### Task 3: Undo button visibility logic

**Files:**
- Modify: `index.html` (element refs near `shareBtn`, ~line 2008; `renderHistory`, ~line 2934-2955)

**Interfaces:**
- Consumes: `loadHistory(): array` (index.html:2869), `loadLastRollUndone(): boolean` (Task 1).
- Produces: `undoRollBtn` element reference and `updateUndoButtonVisibility(): void`, called from inside `renderHistory()` so it automatically re-runs on page load, after every roll (`logRoll` calls `renderHistory()`), after clearing history, and (once Task 4 adds it) after undo.

- [ ] **Step 1: Grab the element reference**

Find the `shareBtn` const declaration (index.html:2008):

```js
const shareBtn = document.getElementById('shareBtn');
```

Immediately after it, add:

```js
const undoRollBtn = document.getElementById('undoRollBtn');
```

- [ ] **Step 2: Add the visibility function and call it from `renderHistory`**

Find `renderHistory` (index.html:2934-2955):

```js
function renderHistory(){
  const entries = loadHistory();
  document.getElementById('histCount').textContent = entries.length;
  const clearBtn = document.getElementById('clearHistoryBtn');
  clearBtn.disabled = entries.length === 0;

  const list = document.getElementById('historyList');
  list.innerHTML = '';

  if(entries.length === 0){
    list.innerHTML = '<div class="hist-empty">No rolls yet.</div>';
    historyMoreBtn.style.display = 'none';
    return;
  }

  const newestFirst = entries.slice().reverse();
  newestFirst.slice(0, HISTORY_PREVIEW_COUNT).forEach(entry => {
    list.appendChild(createHistoryEntryDiv(entry));
  });

  historyMoreBtn.style.display = newestFirst.length > HISTORY_PREVIEW_COUNT ? 'block' : 'none';
}
```

Replace it with (adds an early call to the new visibility function so it runs on every code path, including the empty-history early return):

```js
function updateUndoButtonVisibility(){
  const entries = loadHistory();
  undoRollBtn.classList.toggle('hidden', entries.length === 0 || loadLastRollUndone());
}

function renderHistory(){
  const entries = loadHistory();
  updateUndoButtonVisibility();
  document.getElementById('histCount').textContent = entries.length;
  const clearBtn = document.getElementById('clearHistoryBtn');
  clearBtn.disabled = entries.length === 0;

  const list = document.getElementById('historyList');
  list.innerHTML = '';

  if(entries.length === 0){
    list.innerHTML = '<div class="hist-empty">No rolls yet.</div>';
    historyMoreBtn.style.display = 'none';
    return;
  }

  const newestFirst = entries.slice().reverse();
  newestFirst.slice(0, HISTORY_PREVIEW_COUNT).forEach(entry => {
    list.appendChild(createHistoryEntryDiv(entry));
  });

  historyMoreBtn.style.display = newestFirst.length > HISTORY_PREVIEW_COUNT ? 'block' : 'none';
}
```

- [ ] **Step 3: Manually verify**

Open `index.html` in a browser with a clean/empty `localStorage` (or clear history first).
1. On load with no history, confirm `#undoRollBtn` has class `hidden` and is not visible.
2. Add a name + item, set a title, click Roll. Confirm `#undoRollBtn` becomes visible (class `hidden` removed) immediately after the roll completes.
3. Reload the page. Confirm the button is still visible (visibility survives reload as long as `rollcall_last_undone_v1` is `"false"`).
4. In DevTools console, run `setLastRollUndone(true); renderHistory();` and confirm the button hides.
5. Click "Clear history" and confirm via console that `rollcall_last_undone_v1` reads `"false"` and the button is hidden (since history is now empty too).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: show/hide undo-last-roll button based on history and undone state"
```

---

### Task 4: Undo click handler (confirm, remove entry, reset live state)

**Files:**
- Modify: `index.html` (new listener placed right after the `rollBtn` click handler, ~line 3368)

**Interfaces:**
- Consumes: `confirmModal(message, confirmLabel): Promise<boolean>` (index.html:2034), `loadHistory`/`saveHistory` (index.html:2869-2878), `setLastRollUndone` (Task 1), `renderHistory`/`renderHistoryModalList`/`historyOverlay` (index.html:2934-2999), `resultsTitleEl` (index.html:2508), `results`/`lastRollResult`/`shareBtn` (index.html:2000-2009).
- Produces: click listener on `undoRollBtn` that, when an entry had `postedToDiscord === true`, calls `postUndoToDiscord(url, entry)` (defined in Task 5 — declared with `async function` so hoisting makes the forward reference safe regardless of task execution order within the same file).

- [ ] **Step 1: Add the click handler**

Find the end of the `rollBtn.addEventListener('click', ...)` block (index.html:3368, the closing `});` right before the `// ---- Star Citizen Wiki item search ----` comment). Immediately after that closing `});`, add:

```js

undoRollBtn.addEventListener('click', async () => {
  if(!await confirmModal('Undo the last roll? This removes it from history.', 'Undo last roll')) return;

  const entries = loadHistory();
  const entry = entries.pop();
  if(!entry) return; // button shouldn't be visible/clickable with no history, but guard anyway

  saveHistory(entries);
  setLastRollUndone(true);
  renderHistory();
  if(!historyOverlay.classList.contains('hidden')) renderHistoryModalList();

  results.innerHTML = '';
  resultsTitleEl.textContent = '';
  lastRollResult = null;
  shareBtn.disabled = true;
  shareBtn.classList.remove('ready');

  if(entry.postedToDiscord){
    const webhookUrl = loadWebhookUrl();
    if(webhookUrl) postUndoToDiscord(webhookUrl, entry);
  }
});
```

- [ ] **Step 2: Manually verify**

Open `index.html` in a browser.
1. Add a name + item, set a title, click Roll. Confirm results render and `#undoRollBtn` is visible.
2. Click "Undo last roll". Confirm the themed confirm popup appears. Click Cancel — confirm nothing changes (history entry, results, and button state all untouched).
3. Click "Undo last roll" again and confirm this time. Confirm: the results panel and results title clear, the Share button goes back to its disabled/inert state, the history panel no longer shows that roll, `rollcall_history_v1` in Local Storage lost its last entry, and `#undoRollBtn` is now hidden.
4. Roll again and confirm `#undoRollBtn` reappears (per Task 3's logic via `logRoll` → `setLastRollUndone(false)` → `renderHistory()`).
5. Roll once more, open the History modal (so it's visibly open), then click Undo and confirm — confirm the modal's list also updates to no longer show the undone roll.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: wire up undo-last-roll click handler"
```

---

### Task 5: Discord "Roll Undone" follow-up embed

**Files:**
- Modify: `index.html` (Discord embed color constants, ~line 3132-3133; new function placed after `postRollToDiscord`, ~line 3311)

**Interfaces:**
- Consumes: `escDiscord(s): string` (index.html:3314 — note: currently defined *after* `postRollToDiscord`; this task's new function will sit between them, which is fine since `escDiscord` is a `function` declaration and therefore hoisted).
- Produces: `EMBED_COLOR_UNDO` constant and `postUndoToDiscord(url, entry): Promise<void>`, called by Task 4's undo handler.

- [ ] **Step 1: Add the new embed color constant**

Find the existing embed color constants (index.html:3132-3133):

```js
const EMBED_COLOR = 0xE8A33D; // matches --gold, used for the main setup embed
const EMBED_COLOR_RESULTS = 0x7C6FF0; // matches --violet, used for the results embed
```

Replace with:

```js
const EMBED_COLOR = 0xE8A33D; // matches --gold, used for the main setup embed
const EMBED_COLOR_RESULTS = 0x7C6FF0; // matches --violet, used for the results embed
const EMBED_COLOR_UNDO = 0xE8636A; // matches --bad, used for the undo-notice embed
```

- [ ] **Step 2: Add `postUndoToDiscord`**

Find the end of `postRollToDiscord` (index.html:3255-3311, ending with the closing `}` right before `// Discord uses simple markdown...`). Immediately after that closing `}`, add:

```js

async function postUndoToDiscord(url, entry){
  const embed = {
    title: 'Roll Undone',
    color: EMBED_COLOR_UNDO,
    fields: [
      { name: 'Roll', value: escDiscord(entry.title || 'Untitled Roll'), inline: false },
      { name: 'Originally Posted', value: escDiscord(entry.when), inline: false }
    ]
  };
  try{
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
  }catch(e){ /* silent — the local undo already succeeded regardless of Discord reachability */ }
}
```

- [ ] **Step 3: Manually verify**

Requires a real Discord webhook URL (a private test channel is fine).
1. Open the Discord settings modal, save a valid webhook URL, and enable "Post to Discord".
2. Add a name + item, set a title, click Roll. Confirm the normal two-embed roll post appears in Discord and `discordStatusEl` shows "✓ Posted to Discord."
3. Click "Undo last roll" and confirm the popup. Confirm a new message appears in the same Discord channel: a single red-accented embed titled "Roll Undone" with fields "Roll" (the title used) and "Originally Posted" (matching the time shown in the original embed).
4. Repeat, but this time disable "Post to Discord" *before* rolling (so `postedToDiscord` is `false` for that entry), then undo it — confirm no follow-up message is sent.
5. Repeat once more with "Post to Discord" enabled at roll time, then clear the webhook URL (Discord settings → clear) before undoing — confirm no follow-up is sent and no error appears (silently skipped, per the `if(webhookUrl)` guard in Task 4).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: post a Discord follow-up embed when a roll is undone"
```
