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
