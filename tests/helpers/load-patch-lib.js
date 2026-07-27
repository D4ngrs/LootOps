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
