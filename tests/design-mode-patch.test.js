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
