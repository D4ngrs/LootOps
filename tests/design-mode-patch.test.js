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
