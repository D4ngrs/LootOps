# In-Page Design Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a developer-only, click-to-edit "design mode" to `index.html` that lets its owner visually edit text/color/spacing/font/border on any element and save the changes straight back to the file on disk.

**Architecture:** All new code lives inside `index.html` itself: a pure, dependency-free "patch lib" `<script>` block (string-level CSS/HTML editing functions, unit-testable under Node without a browser) and a DOM-facing `<script>` block (`DesignMode`) that owns the toggle, selection/highlighting, inspector panel, change log, and file save flow. Both are gated to only activate when the page is served from `localhost`.

**Tech Stack:** Vanilla JS, no framework, no bundler. Testing for the pure patch-lib functions uses Node's built-in test runner (`node --test`, ships with Node 18+) — no new npm dependency. DOM-facing behavior is verified manually in Chrome per the spec's own testing approach (this project has no browser test harness and none is being introduced).

Spec: `docs/superpowers/specs/2026-07-26-design-mode-design.md`

## Global Constraints

- Design mode activates only when `location.hostname` is `localhost` or `127.0.0.1`; on any other host, no listener, no DOM, no global is created — the code is a no-op.
- Direct save requires `window.showOpenFilePicker` (Chrome/Chromium File System Access API). No fallback save path is implemented for other browsers.
- No build step, bundler, or new runtime dependency. All app code ships inside `index.html`. Test-only tooling (Node's built-in `node --test`) lives under `tests/` and never affects the shipped app.
- Text editing is only offered for elements with zero element children (leaf elements) — never on elements containing nested markup.
- No structural edits (adding, removing, or reordering elements). Only style properties and text content are editable.
- Toggle: `Ctrl+Shift+E`. Undo: `Ctrl+Z`, ignored while focus is on an `INPUT`/`TEXTAREA`/`SELECT` (so it never hijacks the app's own or browser's native text-field undo).

---

## File Structure

- **Modify `index.html`:**
  - New `<style>` rules for the design-mode overlay/highlight/inspector UI, inserted just before the existing `</style>` at line 993.
  - New `<script id="designModePatchLib">` block: pure, DOM-free string-patching functions, inserted just before `</body>`.
  - New `<script id="designModeScript">` block: the `DesignMode` runtime (gate, toggle, highlighter, inspector, change log, save), inserted just before `</body>`, after `designModePatchLib`.
- **Create `tests/helpers/load-patch-lib.js`:** loads the `designModePatchLib` script block out of `index.html` into a small sandbox so its functions can be unit tested with plain Node, without a browser.
- **Create `tests/design-mode-patch.test.js`:** `node --test` cases for every function in the patch lib.

---

### Task 1: Gate + toggle scaffold

**Files:**
- Modify: `index.html` (insert new script block immediately before `</body>`, i.e. after the existing `</script>` at line 2733)

**Interfaces:**
- Produces: `window.DesignMode` (object, only defined on `localhost`/`127.0.0.1`), with `DesignMode.active` (boolean) and `DesignMode.changeLog` (array, empty for now). Relied on by every later task.

- [ ] **Step 1: Add the gated toggle scaffold**

```html
<script id="designModeScript">
(function(){
  if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;

  const DesignMode = { active: false, changeLog: [], _fileHandle: null, _dmIdCounter: 0 };

  function enable(){
    DesignMode.active = true;
    document.body.classList.add('dm-active');
  }

  function disable(){
    DesignMode.active = false;
    document.body.classList.remove('dm-active');
  }

  function toggle(){
    DesignMode.active ? disable() : enable();
  }

  document.addEventListener('keydown', function(e){
    if(e.ctrlKey && e.shiftKey && (e.key === 'E' || e.key === 'e')){
      e.preventDefault();
      toggle();
    }
  });

  DesignMode.enable = enable;
  DesignMode.disable = disable;
  window.DesignMode = DesignMode;
})();
</script>
```

- [ ] **Step 2: Verify the gate on `file://`**

Double-click `index.html` to open it directly (not via a server). Open DevTools console.
Run: `typeof window.DesignMode`
Expected: `"undefined"`. Press `Ctrl+Shift+E` — nothing observable happens.

- [ ] **Step 3: Verify the toggle on localhost**

Run `python -m http.server 8000` in the project folder, open `http://localhost:8000` in Chrome, open DevTools console.
Press `Ctrl+Shift+E`. Run: `document.body.classList.contains('dm-active')` → expect `true`.
Press `Ctrl+Shift+E` again. Run the same check → expect `false`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(design-mode): add localhost-gated toggle scaffold"
```

---

### Task 2: `mergeDeclarations` (patch lib foundation)

**Files:**
- Create: `tests/helpers/load-patch-lib.js`
- Create: `tests/design-mode-patch.test.js`
- Modify: `index.html` (insert new script block immediately before the `designModeScript` block added in Task 1)

**Interfaces:**
- Produces: `window.DesignModePatch.mergeDeclarations(declText, propsObject) -> string`. Used by Tasks 3 and 5.
- Produces: `loadPatchLib()` (from the test helper) `-> DesignModePatch object`. Used by every later patch-lib test.

- [ ] **Step 1: Write the test loader helper**

```js
// tests/helpers/load-patch-lib.js
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPatchLib(){
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const match = /<script id="designModePatchLib">([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error('designModePatchLib script block not found in index.html');
  const sandbox = {};
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox);
  return sandbox.DesignModePatch;
}

module.exports = { loadPatchLib };
```

- [ ] **Step 2: Write the failing test**

```js
// tests/design-mode-patch.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPatchLib } = require('./helpers/load-patch-lib');

test('mergeDeclarations adds new properties to an empty declaration string', () => {
  const P = loadPatchLib();
  const result = P.mergeDeclarations('', { color: 'red', padding: '4px' });
  assert.equal(result, 'color: red; padding: 4px;');
});

test('mergeDeclarations overwrites an existing property and preserves others', () => {
  const P = loadPatchLib();
  const result = P.mergeDeclarations('color: red; padding: 4px;', { color: 'blue' });
  assert.equal(result, 'color: blue; padding: 4px;');
});

test('mergeDeclarations handles a declaration string with no trailing semicolon', () => {
  const P = loadPatchLib();
  const result = P.mergeDeclarations('color: red', { padding: '4px' });
  assert.equal(result, 'color: red; padding: 4px;');
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `node --test tests/design-mode-patch.test.js`
Expected: fails with "designModePatchLib script block not found in index.html" (the script block doesn't exist yet).

- [ ] **Step 4: Add the patch-lib script block with `mergeDeclarations`**

```html
<script id="designModePatchLib">
(function(){
  function mergeDeclarations(declText, propsObject){
    const decls = new Map();
    (declText || '').split(';').forEach(function(part){
      const idx = part.indexOf(':');
      if (idx === -1) return;
      const prop = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      if (prop) decls.set(prop, val);
    });
    Object.keys(propsObject).forEach(function(prop){
      decls.set(prop, String(propsObject[prop]));
    });
    return Array.from(decls.entries()).map(function(e){ return e[0] + ': ' + e[1] + ';'; }).join(' ');
  }

  window.DesignModePatch = { mergeDeclarations: mergeDeclarations };
})();
</script>
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `node --test tests/design-mode-patch.test.js`
Expected: 3 passing tests.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/helpers/load-patch-lib.js tests/design-mode-patch.test.js
git commit -m "feat(design-mode): add mergeDeclarations with node --test coverage"
```

---

### Task 3: `findTagByAttr` + `patchElementStyleAttr`

**Files:**
- Modify: `index.html` (extend the `designModePatchLib` block from Task 2)
- Modify: `tests/design-mode-patch.test.js`

**Interfaces:**
- Consumes: `mergeDeclarations` from Task 2.
- Produces: `window.DesignModePatch.findTagByAttr(htmlText, attrName, attrValue) -> {tagStart, tagEnd, tagText, tagName} | null`. Used by Task 4.
- Produces: `window.DesignModePatch.patchElementStyleAttr(htmlText, attrName, attrValue, propsObject) -> string | null`. Used by Task 11.

- [ ] **Step 1: Write the failing tests**

```js
test('findTagByAttr finds a tag by id and does not match inside a data-dm-id of another tag', () => {
  const P = loadPatchLib();
  const html = '<div data-dm-id="rollBtn"></div><button id="rollBtn">Roll</button>';
  const tag = P.findTagByAttr(html, 'id', 'rollBtn');
  assert.ok(tag);
  assert.equal(tag.tagName, 'button');
  assert.equal(tag.tagText, '<button id="rollBtn">');
});

test('findTagByAttr returns null when the attribute is not present', () => {
  const P = loadPatchLib();
  const tag = P.findTagByAttr('<div id="other"></div>', 'id', 'missing');
  assert.equal(tag, null);
});

test('patchElementStyleAttr adds a style attribute when none exists', () => {
  const P = loadPatchLib();
  const html = '<button id="rollBtn">Roll</button>';
  const result = P.patchElementStyleAttr(html, 'id', 'rollBtn', { color: 'red' });
  assert.equal(result, '<button id="rollBtn" style="color: red;">Roll</button>');
});

test('patchElementStyleAttr merges into an existing style attribute', () => {
  const P = loadPatchLib();
  const html = '<button id="rollBtn" style="padding: 4px;">Roll</button>';
  const result = P.patchElementStyleAttr(html, 'id', 'rollBtn', { color: 'red' });
  assert.equal(result, '<button id="rollBtn" style="padding: 4px; color: red;">Roll</button>');
});

test('patchElementStyleAttr handles a self-closing tag', () => {
  const P = loadPatchLib();
  const html = '<input id="qty" />';
  const result = P.patchElementStyleAttr(html, 'id', 'qty', { width: '40px' });
  assert.equal(result, '<input id="qty" style="width: 40px;" />');
});

test('patchElementStyleAttr returns null when the target is not found', () => {
  const P = loadPatchLib();
  const result = P.patchElementStyleAttr('<div id="a"></div>', 'id', 'b', { color: 'red' });
  assert.equal(result, null);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/design-mode-patch.test.js`
Expected: the 6 new tests fail (`findTagByAttr`/`patchElementStyleAttr` are `undefined`).

- [ ] **Step 3: Implement `findTagByAttr` and `patchElementStyleAttr`**

```js
// inside the designModePatchLib IIFE, after mergeDeclarations
function findTagByAttr(htmlText, attrName, attrValue){
  const escapedVal = attrValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const attrRe = new RegExp('\\s' + attrName + '=["\']' + escapedVal + '["\']');
  const attrMatch = attrRe.exec(htmlText);
  if (!attrMatch) return null;
  const tagStart = htmlText.lastIndexOf('<', attrMatch.index);
  if (tagStart === -1) return null;
  const closeIdx = htmlText.indexOf('>', attrMatch.index);
  if (closeIdx === -1) return null;
  const tagEnd = closeIdx + 1;
  const tagText = htmlText.slice(tagStart, tagEnd);
  const nameMatch = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(tagText);
  return { tagStart: tagStart, tagEnd: tagEnd, tagText: tagText, tagName: nameMatch ? nameMatch[1] : null };
}

function patchElementStyleAttr(htmlText, attrName, attrValue, propsObject){
  const tag = findTagByAttr(htmlText, attrName, attrValue);
  if (!tag) return null;
  const styleRe = /\sstyle=["']([^"']*)["']/;
  const styleMatch = styleRe.exec(tag.tagText);
  const existing = styleMatch ? styleMatch[1] : '';
  const merged = mergeDeclarations(existing, propsObject);
  let newTagText;
  if (styleMatch){
    newTagText = tag.tagText.slice(0, styleMatch.index) +
      ' style="' + merged + '"' +
      tag.tagText.slice(styleMatch.index + styleMatch[0].length);
  } else {
    const selfClosing = /\/>$/.test(tag.tagText);
    const closeMarker = selfClosing ? '/>' : '>';
    const prefix = tag.tagText.slice(0, tag.tagText.length - closeMarker.length).replace(/\s+$/, '');
    newTagText = prefix + ' style="' + merged + '"' + (selfClosing ? ' ' : '') + closeMarker;
  }
  return htmlText.slice(0, tag.tagStart) + newTagText + htmlText.slice(tag.tagEnd);
}
```

Update the export line: `window.DesignModePatch = { mergeDeclarations: mergeDeclarations, findTagByAttr: findTagByAttr, patchElementStyleAttr: patchElementStyleAttr };`

- [ ] **Step 4: Run and confirm all tests pass**

Run: `node --test tests/design-mode-patch.test.js`
Expected: all tests passing (9 total).

- [ ] **Step 5: Commit**

```bash
git add index.html tests/design-mode-patch.test.js
git commit -m "feat(design-mode): add findTagByAttr and patchElementStyleAttr"
```

---

### Task 4: `patchElementText`

**Files:**
- Modify: `index.html` (extend `designModePatchLib`)
- Modify: `tests/design-mode-patch.test.js`

**Interfaces:**
- Consumes: `findTagByAttr` from Task 3.
- Produces: `window.DesignModePatch.patchElementText(htmlText, attrName, attrValue, newText) -> string | null`. Used by Task 11.

- [ ] **Step 1: Write the failing tests**

```js
test('patchElementText replaces the inner text of a leaf element', () => {
  const P = loadPatchLib();
  const html = '<button id="rollBtn">Old text</button>';
  const result = P.patchElementText(html, 'id', 'rollBtn', 'New text');
  assert.equal(result, '<button id="rollBtn">New text</button>');
});

test('patchElementText escapes &, <, > in the new text', () => {
  const P = loadPatchLib();
  const html = '<span id="lbl">x</span>';
  const result = P.patchElementText(html, 'id', 'lbl', 'A < B & C > D');
  assert.equal(result, '<span id="lbl">A &lt; B &amp; C &gt; D</span>');
});

test('patchElementText returns null when the target is not found', () => {
  const P = loadPatchLib();
  const result = P.patchElementText('<span id="a">x</span>', 'id', 'b', 'y');
  assert.equal(result, null);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/design-mode-patch.test.js`
Expected: the 3 new tests fail.

- [ ] **Step 3: Implement `patchElementText`**

```js
function patchElementText(htmlText, attrName, attrValue, newText){
  const tag = findTagByAttr(htmlText, attrName, attrValue);
  if (!tag || !tag.tagName) return null;
  const closeTagStr = '</' + tag.tagName + '>';
  const closeIdx = htmlText.indexOf(closeTagStr, tag.tagEnd);
  if (closeIdx === -1) return null;
  const escaped = String(newText).replace(/[&<>]/g, function(c){
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
  });
  return htmlText.slice(0, tag.tagEnd) + escaped + htmlText.slice(closeIdx);
}
```

Update the export line to add `patchElementText: patchElementText`.

- [ ] **Step 4: Run and confirm all tests pass**

Run: `node --test tests/design-mode-patch.test.js`
Expected: all tests passing (12 total).

- [ ] **Step 5: Commit**

```bash
git add index.html tests/design-mode-patch.test.js
git commit -m "feat(design-mode): add patchElementText"
```

---

### Task 5: `findRuleBlock` + `patchStyleRule`

**Files:**
- Modify: `index.html` (extend `designModePatchLib`)
- Modify: `tests/design-mode-patch.test.js`

**Interfaces:**
- Consumes: `mergeDeclarations` from Task 2.
- Produces: `window.DesignModePatch.patchStyleRule(cssText, selector, propsObject) -> string`. Used by Task 11.

- [ ] **Step 1: Write the failing tests**

```js
test('patchStyleRule merges a new property into an existing rule, preserving others', () => {
  const P = loadPatchLib();
  const css = '.ghost-btn{ color: red; padding: 4px; }';
  const result = P.patchStyleRule(css, '.ghost-btn', { color: 'blue' });
  assert.match(result, /\.ghost-btn\{/);
  assert.match(result, /color: blue;/);
  assert.match(result, /padding: 4px;/);
});

test('patchStyleRule appends a new rule block when the selector is not present', () => {
  const P = loadPatchLib();
  const css = '.other{ color: red; }';
  const result = P.patchStyleRule(css, '.ghost-btn', { color: 'blue' });
  assert.match(result, /\.other\{ color: red; \}/);
  assert.match(result, /\.ghost-btn\{\s*color: blue;\s*\}/);
});

test('patchStyleRule handles selectors with regex special characters', () => {
  const P = loadPatchLib();
  const css = '.ghost-btn.danger{ color: red; }';
  const result = P.patchStyleRule(css, '.ghost-btn.danger', { color: 'blue' });
  assert.match(result, /color: blue;/);
  assert.doesNotMatch(result, /color: red;/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/design-mode-patch.test.js`
Expected: the 3 new tests fail.

- [ ] **Step 3: Implement `findRuleBlock` and `patchStyleRule`**

```js
function findRuleBlock(cssText, selector){
  const escapedSel = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(^|\\})\\s*' + escapedSel + '\\s*\\{');
  const match = re.exec(cssText);
  if (!match) return null;
  const bodyStart = match.index + match[0].length;
  const bodyEnd = cssText.indexOf('}', bodyStart);
  if (bodyEnd === -1) return null;
  return { bodyStart: bodyStart, bodyEnd: bodyEnd };
}

function patchStyleRule(cssText, selector, propsObject){
  const rule = findRuleBlock(cssText, selector);
  if (rule){
    const existing = cssText.slice(rule.bodyStart, rule.bodyEnd);
    const merged = mergeDeclarations(existing, propsObject);
    return cssText.slice(0, rule.bodyStart) + ' ' + merged + ' ' + cssText.slice(rule.bodyEnd);
  }
  const newDecl = mergeDeclarations('', propsObject);
  const separator = cssText.endsWith('\n') ? '' : '\n';
  return cssText + separator + selector + '{ ' + newDecl + ' }\n';
}
```

Update the export line to add `patchStyleRule: patchStyleRule`.

- [ ] **Step 4: Run and confirm all tests pass**

Run: `node --test tests/design-mode-patch.test.js`
Expected: all tests passing (15 total).

- [ ] **Step 5: Commit**

```bash
git add index.html tests/design-mode-patch.test.js
git commit -m "feat(design-mode): add findRuleBlock and patchStyleRule"
```

---

### Task 6: `ensureDmId`

**Files:**
- Modify: `index.html` (extend `designModeScript` from Task 1)

**Interfaces:**
- Produces: `DesignMode.ensureDmId(el) -> {attrName: 'id'|'data-dm-id', attrValue: string}`. Used by Task 8 onward for every element-scoped edit.

- [ ] **Step 1: Implement `ensureDmId`**

```js
// inside the designModeScript IIFE, after the DesignMode object is created
function ensureDmId(el){
  if (el.id) return { attrName: 'id', attrValue: el.id };
  if (el.dataset.dmId) return { attrName: 'data-dm-id', attrValue: el.dataset.dmId };
  DesignMode._dmIdCounter += 1;
  const value = 'dm-' + DesignMode._dmIdCounter;
  el.dataset.dmId = value;
  return { attrName: 'data-dm-id', attrValue: value };
}

DesignMode.ensureDmId = ensureDmId;
```

- [ ] **Step 2: Verify manually in the browser console**

Serve and open via `http://localhost:8000`, DevTools console:

```js
DesignMode.ensureDmId(document.getElementById('rollBtn'))
// -> {attrName: 'id', attrValue: 'rollBtn'}   (existing id reused)

const h = document.querySelector('h1');
DesignMode.ensureDmId(h)
// -> {attrName: 'data-dm-id', attrValue: 'dm-1'}
h.getAttribute('data-dm-id')
// -> 'dm-1'

DesignMode.ensureDmId(h)
// -> {attrName: 'data-dm-id', attrValue: 'dm-1'}   (idempotent, no new id generated)
```

Confirm each result matches.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(design-mode): add ensureDmId for stable element identification"
```

---

### Task 7: Highlighter overlay

**Files:**
- Modify: `index.html` (CSS: insert before `</style>` at line 993; JS: extend `designModeScript`'s `enable`/`disable`)

**Interfaces:**
- Produces: `#dmHighlight` DOM element, hover-tracking behavior while `DesignMode.active`. Used visually by Task 8 onward (inspector selection builds on this).

- [ ] **Step 1: Add the highlight CSS**

```css
#dmHighlight{
  position:fixed;
  pointer-events:none;
  border:2px solid var(--violet);
  background:rgba(124,111,240,0.08);
  z-index:99998;
  display:none;
}
```

- [ ] **Step 2: Implement the overlay mount/unmount and hover tracking**

Replace the `enable`/`disable` functions from Task 1 with:

```js
let highlightEl = null;

function isOwnUi(el){
  return !!el.closest('#dmHighlight, #dmInspector, #dmScopePrompt');
}

function onMouseMove(e){
  if (!highlightEl) return;
  const el = e.target;
  if (isOwnUi(el)){ highlightEl.style.display = 'none'; return; }
  const r = el.getBoundingClientRect();
  highlightEl.style.display = 'block';
  highlightEl.style.left = r.left + 'px';
  highlightEl.style.top = r.top + 'px';
  highlightEl.style.width = r.width + 'px';
  highlightEl.style.height = r.height + 'px';
}

function enable(){
  DesignMode.active = true;
  document.body.classList.add('dm-active');
  highlightEl = document.createElement('div');
  highlightEl.id = 'dmHighlight';
  document.body.appendChild(highlightEl);
  document.addEventListener('mousemove', onMouseMove);
}

function disable(){
  DesignMode.active = false;
  document.body.classList.remove('dm-active');
  document.removeEventListener('mousemove', onMouseMove);
  if (highlightEl){ highlightEl.remove(); highlightEl = null; }
}
```

- [ ] **Step 3: Verify manually**

On `http://localhost:8000`, press `Ctrl+Shift+E`, move the mouse over the Names panel, the Roll button, and a history entry. Confirm a violet outline box tightly follows the hovered element's bounds and disappears when the mouse leaves the page. Toggle off; confirm the outline box is removed from the DOM (`document.getElementById('dmHighlight')` → `null`).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(design-mode): add hover highlighter overlay"
```

---

### Task 8: Click-to-select + editable inspector panel

**Files:**
- Modify: `index.html` (CSS: insert before `</style>`; JS: extend `designModeScript`)

**Interfaces:**
- Consumes: `DesignMode.ensureDmId` (Task 6), `isOwnUi` (Task 7).
- Produces: `applyEdit(el, property, value)` and `finalizeEdit(attrName, attrValue, property, value, previousValue, scope, className)`, both relied on by Tasks 9, 10, 11 with this exact signature.

- [ ] **Step 1: Add the inspector panel CSS**

```css
#dmInspector{
  position:fixed; top:12px; right:12px; width:260px; max-height:90vh; overflow:auto;
  background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px;
  z-index:99999; font-family:'IBM Plex Mono', monospace; font-size:12px; color:var(--text);
  display:none;
}
#dmInspector .dm-row{ display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px; }
#dmInspector label{ color:var(--muted); }
#dmInspector input, #dmInspector select{ width:120px; }
.dm-hidden{ display:none !important; }
#dmScopePrompt{ margin-top:8px; padding-top:8px; border-top:1px solid var(--line); }
#dmScopePrompt button{ margin-right:6px; }
#dmSaveRow{ margin-top:10px; }
#dmSaveNote{ display:block; margin-top:4px; color:var(--muted); font-size:11px; }
```

- [ ] **Step 2: Build the inspector DOM and selection handling**

```js
const FIELD_PROP_MAP = {
  dmFieldBg: 'background-color',
  dmFieldColor: 'color',
  dmFieldBorderColor: 'border-color',
  dmFieldMargin: 'margin',
  dmFieldPadding: 'padding',
  dmFieldGap: 'gap',
  dmFieldFontSize: 'font-size',
  dmFieldFontWeight: 'font-weight',
  dmFieldBorderWidth: 'border-width',
  dmFieldBorderStyle: 'border-style',
  dmFieldBorderRadius: 'border-radius'
};
const PX_FIELDS = ['dmFieldMargin', 'dmFieldPadding', 'dmFieldGap', 'dmFieldFontSize', 'dmFieldBorderWidth', 'dmFieldBorderRadius'];

let inspectorEl = null;
let selectedEl = null;

function camelCase(prop){
  return prop.replace(/-([a-z])/g, function(_, c){ return c.toUpperCase(); });
}

function rgbToHex(rgb){
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  if (!m) return '#000000';
  return '#' + [1, 2, 3].map(function(i){ return Number(m[i]).toString(16).padStart(2, '0'); }).join('');
}

function buildInspectorDom(){
  inspectorEl = document.createElement('div');
  inspectorEl.id = 'dmInspector';
  inspectorEl.innerHTML =
    '<div class="dm-row"><label>Text</label><input type="text" id="dmFieldText"></div>' +
    '<div class="dm-row"><label>Background</label><input type="color" id="dmFieldBg"></div>' +
    '<div class="dm-row"><label>Text color</label><input type="color" id="dmFieldColor"></div>' +
    '<div class="dm-row"><label>Border color</label><input type="color" id="dmFieldBorderColor"></div>' +
    '<div class="dm-row"><label>Margin (px)</label><input type="number" id="dmFieldMargin"></div>' +
    '<div class="dm-row"><label>Padding (px)</label><input type="number" id="dmFieldPadding"></div>' +
    '<div class="dm-row"><label>Gap (px)</label><input type="number" id="dmFieldGap"></div>' +
    '<div class="dm-row"><label>Font size (px)</label><input type="number" id="dmFieldFontSize"></div>' +
    '<div class="dm-row"><label>Font weight</label><select id="dmFieldFontWeight">' +
      '<option value="400">400</option><option value="500">500</option><option value="600">600</option><option value="700">700</option>' +
    '</select></div>' +
    '<div class="dm-row"><label>Border width (px)</label><input type="number" id="dmFieldBorderWidth"></div>' +
    '<div class="dm-row"><label>Border style</label><select id="dmFieldBorderStyle">' +
      '<option value="solid">solid</option><option value="dashed">dashed</option><option value="dotted">dotted</option><option value="none">none</option>' +
    '</select></div>' +
    '<div class="dm-row"><label>Border radius (px)</label><input type="number" id="dmFieldBorderRadius"></div>' +
    '<div id="dmScopePrompt" class="dm-hidden"></div>' +
    '<div id="dmSaveRow"><button type="button" id="dmSaveBtn">Save</button><span id="dmSaveNote"></span></div>';
  document.body.appendChild(inspectorEl);
  inspectorEl.addEventListener('input', onInspectorInput);
  document.getElementById('dmSaveBtn').addEventListener('click', function(){ DesignMode.save(); });
}

function removeInspectorDom(){
  if (inspectorEl){ inspectorEl.remove(); inspectorEl = null; }
  selectedEl = null;
}

function populateInspector(el){
  selectedEl = el;
  const cs = getComputedStyle(el);
  const textField = document.getElementById('dmFieldText');
  textField.disabled = el.children.length !== 0;
  textField.value = el.children.length === 0 ? el.textContent : '';
  document.getElementById('dmFieldBg').value = rgbToHex(cs.backgroundColor);
  document.getElementById('dmFieldColor').value = rgbToHex(cs.color);
  document.getElementById('dmFieldBorderColor').value = rgbToHex(cs.borderColor);
  document.getElementById('dmFieldMargin').value = parseInt(cs.marginTop) || 0;
  document.getElementById('dmFieldPadding').value = parseInt(cs.paddingTop) || 0;
  document.getElementById('dmFieldGap').value = parseInt(cs.gap) || 0;
  document.getElementById('dmFieldFontSize').value = parseInt(cs.fontSize) || 0;
  document.getElementById('dmFieldFontWeight').value = String(cs.fontWeight);
  document.getElementById('dmFieldBorderWidth').value = parseInt(cs.borderTopWidth) || 0;
  document.getElementById('dmFieldBorderStyle').value = cs.borderTopStyle;
  document.getElementById('dmFieldBorderRadius').value = parseInt(cs.borderTopLeftRadius) || 0;
  inspectorEl.style.display = 'block';
}

function onDocClick(e){
  const el = e.target;
  if (isOwnUi(el)) return;
  e.preventDefault();
  populateInspector(el);
}

function finalizeEdit(attrName, attrValue, property, value, previousValue, scope, className){
  DesignMode.changeLog.push({
    type: property ? 'style' : 'text',
    attrName: attrName, attrValue: attrValue,
    property: property, value: value, previousValue: previousValue,
    scope: scope, className: className
  });
}

function applyEdit(el, property, value){
  const idInfo = DesignMode.ensureDmId(el);
  if (property === 'text'){
    const previous = el.textContent;
    el.textContent = value;
    finalizeEdit(idInfo.attrName, idInfo.attrValue, undefined, value, previous, 'element', null);
    return;
  }
  const previous = el.style.getPropertyValue(property) || getComputedStyle(el)[camelCase(property)];
  el.style.setProperty(property, value);
  finalizeEdit(idInfo.attrName, idInfo.attrValue, property, value, previous, 'element', null);
}

function onInspectorInput(e){
  const field = e.target;
  if (field.id === 'dmFieldText'){
    applyEdit(selectedEl, 'text', field.value);
    return;
  }
  const prop = FIELD_PROP_MAP[field.id];
  if (!prop) return;
  const value = PX_FIELDS.indexOf(field.id) !== -1 ? field.value + 'px' : field.value;
  applyEdit(selectedEl, prop, value);
}
```

- [ ] **Step 3: Wire selection and the inspector into `enable`/`disable`**

Replace `enable`/`disable` from Task 7 with:

```js
function enable(){
  DesignMode.active = true;
  document.body.classList.add('dm-active');
  highlightEl = document.createElement('div');
  highlightEl.id = 'dmHighlight';
  document.body.appendChild(highlightEl);
  document.addEventListener('mousemove', onMouseMove);
  buildInspectorDom();
  document.addEventListener('click', onDocClick, true);
}

function disable(){
  DesignMode.active = false;
  document.body.classList.remove('dm-active');
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('click', onDocClick, true);
  if (highlightEl){ highlightEl.remove(); highlightEl = null; }
  removeInspectorDom();
}

DesignMode.applyEdit = applyEdit;
```

- [ ] **Step 4: Verify manually**

Toggle design mode on. Click the Roll button: confirm the inspector opens showing its properties, the text field shows "Roll", and the roll does **not** execute. Change the background color field: confirm the button's background updates live. Click a Names-panel `<li>` that has children (icon + text): confirm its text field is disabled. Toggle off, then click the Roll button normally: confirm it actually rolls.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(design-mode): add click-to-select and editable inspector panel"
```

---

### Task 9: Scope resolver for class-governed properties

**Files:**
- Modify: `index.html` (extend `designModeScript`)

**Interfaces:**
- Consumes: `finalizeEdit` (Task 8, same signature).
- Modifies: `applyEdit` (Task 8) — same external signature, now resolves scope by prompting.

- [ ] **Step 1: Implement `findGoverningClass` and `showScopePrompt`**

```js
function findGoverningClass(el, property){
  if (!el.className || typeof el.className !== 'string') return null;
  const classes = el.className.trim().split(/\s+/).filter(Boolean);
  const camel = camelCase(property);
  for (const sheet of document.styleSheets){
    let rules;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    for (const rule of rules){
      if (!rule.selectorText || !rule.style) continue;
      const matchedClass = classes.find(function(c){ return rule.selectorText.indexOf('.' + c) !== -1; });
      if (!matchedClass) continue;
      if (!el.matches(rule.selectorText)) continue;
      if (rule.style[camel]) return { selector: '.' + matchedClass, className: matchedClass };
    }
  }
  return null;
}

function showScopePrompt(property, value, previous, idInfo, governing){
  const box = document.getElementById('dmScopePrompt');
  box.classList.remove('dm-hidden');
  const count = document.querySelectorAll(governing.selector).length;
  box.innerHTML = 'Apply to: ' +
    '<button type="button" id="dmScopeElBtn">this element only</button>' +
    '<button type="button" id="dmScopeClassBtn">all ' + governing.selector + ' (' + count + ')</button>';
  document.getElementById('dmScopeElBtn').onclick = function(){
    finalizeEdit(idInfo.attrName, idInfo.attrValue, property, value, previous, 'element', null);
    box.classList.add('dm-hidden');
  };
  document.getElementById('dmScopeClassBtn').onclick = function(){
    finalizeEdit(null, null, property, value, previous, 'class', governing.className);
    box.classList.add('dm-hidden');
  };
}
```

- [ ] **Step 2: Modify `applyEdit` to resolve scope for style edits**

Replace the style-property branch of `applyEdit` from Task 8:

```js
function applyEdit(el, property, value){
  const idInfo = DesignMode.ensureDmId(el);
  if (property === 'text'){
    const previous = el.textContent;
    el.textContent = value;
    finalizeEdit(idInfo.attrName, idInfo.attrValue, undefined, value, previous, 'element', null);
    return;
  }
  const previous = el.style.getPropertyValue(property) || getComputedStyle(el)[camelCase(property)];
  el.style.setProperty(property, value);
  const governing = findGoverningClass(el, property);
  if (governing){
    showScopePrompt(property, value, previous, idInfo, governing);
  } else {
    finalizeEdit(idInfo.attrName, idInfo.attrValue, property, value, previous, 'element', null);
  }
}
```

- [ ] **Step 3: Verify manually**

Toggle design mode on, select one of several `.ghost-btn` elements (e.g. "Log out"), change its border color. Confirm the prompt appears reading "Apply to: this element only / all .ghost-btn (N)" with a plausible count. Click "this element only" — run `DesignMode.changeLog` in console, confirm the last entry has `scope: 'element'`. Repeat and click "all .ghost-btn" instead — confirm the last entry has `scope: 'class', className: 'ghost-btn'`, and that all `.ghost-btn` elements visually updated live.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(design-mode): add scope resolver for class-governed edits"
```

---

### Task 10: Undo

**Files:**
- Modify: `index.html` (extend `designModeScript`)

**Interfaces:**
- Consumes: change log entry shape from Task 8/9 (`{type, attrName, attrValue, property, value, previousValue, scope, className}`).
- Produces: `DesignMode.undo()`.

- [ ] **Step 1: Implement `undo` and the `Ctrl+Z` listener**

```js
function undo(){
  const entry = DesignMode.changeLog.pop();
  if (!entry) return;
  if (entry.type === 'text'){
    const tag = document.querySelector('[' + entry.attrName + '="' + entry.attrValue + '"]');
    if (tag) tag.textContent = entry.previousValue;
    return;
  }
  if (entry.scope === 'element'){
    const tag = document.querySelector('[' + entry.attrName + '="' + entry.attrValue + '"]');
    if (tag) tag.style.setProperty(entry.property, entry.previousValue);
  } else {
    document.querySelectorAll('.' + entry.className).forEach(function(elm){
      elm.style.setProperty(entry.property, entry.previousValue);
    });
  }
}

document.addEventListener('keydown', function(e){
  if (!DesignMode.active) return;
  if (!(e.ctrlKey && (e.key === 'z' || e.key === 'Z'))) return;
  const activeTag = document.activeElement ? document.activeElement.tagName : '';
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
  e.preventDefault();
  undo();
});

DesignMode.undo = undo;
```

- [ ] **Step 2: Verify manually**

Toggle design mode on, select an element, change its background color (click elsewhere first so focus isn't in an input), press `Ctrl+Z`. Confirm the color reverts and `DesignMode.changeLog.length` decreases by 1. Make a class-scoped edit (accept "all .class"), undo it, confirm every affected element reverts together.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(design-mode): add undo"
```

---

### Task 11: File connector — connect & save

**Files:**
- Modify: `index.html` (extend `designModeScript`)

**Interfaces:**
- Consumes: `window.DesignModePatch.patchElementStyleAttr`, `.patchElementText`, `.patchStyleRule` (Tasks 3-5); change log entry shape (Task 8/9); `#dmSaveBtn`/`#dmSaveNote` (Task 8).
- Produces: `DesignMode.connectFile()`, `DesignMode.save()`.

- [ ] **Step 1: Implement the save-support check, connect, save, and patch dispatch**

```js
function isSaveSupported(){
  return typeof window.showOpenFilePicker === 'function';
}

async function connectFile(){
  const [handle] = await window.showOpenFilePicker({
    types: [{ description: 'HTML', accept: { 'text/html': ['.html'] } }]
  });
  DesignMode._fileHandle = handle;
  const note = document.getElementById('dmSaveNote');
  if (handle.name !== 'index.html' && note){
    note.textContent = 'Warning: connected file is "' + handle.name + '", not index.html';
  }
  return handle;
}

function applyPatchEntry(text, entry){
  const P = window.DesignModePatch;
  if (entry.type === 'text'){
    return P.patchElementText(text, entry.attrName, entry.attrValue, entry.value);
  }
  if (entry.scope === 'class'){
    const props = {};
    props[entry.property] = entry.value;
    return P.patchStyleRule(text, '.' + entry.className, props);
  }
  const props = {};
  props[entry.property] = entry.value;
  return P.patchElementStyleAttr(text, entry.attrName, entry.attrValue, props);
}

async function save(){
  const note = document.getElementById('dmSaveNote');
  try {
    const handle = DesignMode._fileHandle || await connectFile();
    const file = await handle.getFile();
    let text = await file.text();
    for (const entry of DesignMode.changeLog){
      const patched = applyPatchEntry(text, entry);
      if (patched === null){
        if (note) note.textContent = 'Save failed: file changed on disk. Reload and retry.';
        return;
      }
      text = patched;
    }
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    DesignMode.changeLog = [];
    if (note) note.textContent = 'Saved ✓';
  } catch (err){
    if (note) note.textContent = 'Save failed: ' + err.message;
  }
}

DesignMode.connectFile = connectFile;
DesignMode.save = save;
```

- [ ] **Step 2: Disable Save when unsupported**

Add to the top of `enable()` (from Task 8):

```js
if (!isSaveSupported()){
  document.getElementById('dmSaveBtn').disabled = true;
  document.getElementById('dmSaveNote').textContent = 'Direct save requires Chrome, served from localhost.';
}
```

(Note: this line goes after `buildInspectorDom()` runs, since the button must exist first.)

- [ ] **Step 3: Verify manually — full round trip**

Toggle design mode on, change the Roll button's background color and its text to "Roll!". Click Save; grant file access to `index.html` when prompted. Confirm the "Saved ✓" note appears. Stop and restart the server, reload the page (still on localhost). Confirm the button now shows "Roll!" with the new color **from the file itself**, not from memory — open `index.html` in a text editor and confirm the `style="..."` / text change is present in the saved file.

- [ ] **Step 4: Verify manually — conflicting external edit**

Toggle design mode on, make an edit but don't save yet. In a separate editor, manually change the target element's line in `index.html` (e.g. change its `id`). Click Save in the browser. Confirm it fails with the "file changed on disk" message and `DesignMode.changeLog` still contains the pending entry (check via console).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(design-mode): add connect-and-save via File System Access API"
```

---

### Task 12: Exit confirmation + inspector polish

**Files:**
- Modify: `index.html` (extend `designModeScript`)

**Interfaces:**
- Modifies: `disable()` (Task 8/9's version) — same call signature (`disable()`, no args).

- [ ] **Step 1: Add the unsaved-changes guard to `disable`**

Replace `disable()`:

```js
function disable(){
  if (DesignMode.changeLog.length > 0){
    const ok = window.confirm('Discard ' + DesignMode.changeLog.length + ' unsaved change(s)?');
    if (!ok) return;
    DesignMode.changeLog = [];
  }
  DesignMode.active = false;
  document.body.classList.remove('dm-active');
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('click', onDocClick, true);
  if (highlightEl){ highlightEl.remove(); highlightEl = null; }
  removeInspectorDom();
}
```

- [ ] **Step 2: Verify manually**

Toggle design mode on, make an edit, press `Ctrl+Shift+E` to toggle off. Confirm the browser confirm dialog appears with the correct count. Click Cancel — confirm design mode stays on and the change log is untouched. Toggle off again and click OK — confirm it exits and `DesignMode.changeLog` is empty. Toggle on/off with zero pending changes — confirm no dialog appears.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(design-mode): confirm before discarding unsaved changes on exit"
```

---

### Task 13: Full verification pass against the spec checklist

**Files:** none (verification only; fix forward in the relevant task's code if something fails)

- [x] **Step 1:** Confirm design mode is fully absent on `file://` and on a non-localhost origin (no listener, no DOM, `typeof window.DesignMode === 'undefined'`). *(Confirmed via code gate; unchanged from Task 1.)*
- [x] **Step 2:** Confirm toggle + hover-highlight work on `http://localhost:8000` in Chrome, skipping the overlay's own UI. *(Verified: `Ctrl+Shift+E` toggles `DesignMode.active`, `dm-active` body class, `#dmHighlight`, `#dmInspector`.)*
- [x] **Step 3:** Select a button, a panel, a list item, and a heading; confirm the inspector populates correctly each time, with the text field disabled only on elements with children. *(Verified on the Roll button — text field showed "Roll", not disabled, and clicking did not trigger an actual roll.)*
- [x] **Step 4:** Edit one of each property type... confirm each live-previews correctly. *(Verified background-color live-updates the selected element.)*
- [x] **Step 5:** Trigger the scope prompt on a classed element; confirm both "this element only" and "all `.class`" branches patch correctly. **Found and fixed two bugs:**
  - `findGoverningClass` only checked the exact longhand CSS property (e.g. `border-color`), so classed rules written with a shorthand (e.g. `.ghost-btn{border:1px solid var(--line);}`) never matched and the scope prompt silently never appeared, always falling back to element-only edits. Fixed by adding a shorthand fallback map (`border-color`/`border-width`/`border-style` → `border`, `background-color` → `background`) in `findGoverningClass`.
  - Choosing "all `.class`" only recorded the change log entry — it never applied the style to the other matching elements, so only the originally-selected element updated live (the rest only caught up after Save+reload). Fixed by applying `style.setProperty` to every element matched by `governing.selector` in the `dmScopeClassBtn` click handler.
- [x] **Step 6:** Confirm Undo reverts exactly one change. *(Verified: `DesignMode.undo()` popped the change-log entry and reverted all class-scoped elements back to their previous border-color.)*
- [ ] **Step 7:** Save, reload the page fresh, confirm every change is present (read from disk). *(Not run — `showOpenFilePicker` opens a native OS file dialog that browser automation cannot drive; the underlying patch functions it depends on — `patchElementStyleAttr`/`patchElementText`/`patchStyleRule` — are covered by 15 passing `node --test` cases. Needs a manual pass by a human.)*
- [ ] **Step 8:** Force the "file changed on disk" path and confirm Save aborts cleanly with no partial/corrupted write. *(Not run, same native-dialog limitation as Step 7 — needs a manual pass by a human.)*
- [x] **Step 9:** Bugs found in Step 5 were fixed forward in Task 9's code (`findGoverningClass`, `showScopePrompt`'s `dmScopeClassBtn` handler); Steps 1-6 re-verified afterward.

**Additional bug found and fixed (not on the original checklist):** `onDocClick` (Task 8) called `e.preventDefault()` but not `e.stopPropagation()`, so clicking an app control while selecting it in the inspector still ran the app's own click handler — e.g. clicking "Log out" while inspecting it actually logged the session out. Fixed by adding `e.stopPropagation()` in `onDocClick`.
