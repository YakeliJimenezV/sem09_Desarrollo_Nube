const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const folders = ['src', 'public/js', 'scripts'];
let failed = false;
let checked = 0;

function checkDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      checkDirectory(filename);
    } else if (entry.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
      checked += 1;
      if (result.error || result.status !== 0) {
        failed = true;
        console.error(path.relative(root, filename), result.error?.message || result.stderr);
      }
    }
  }
}

try {
  JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const folder of folders) checkDirectory(path.join(root, folder));

  for (const view of fs.readdirSync(path.join(root, 'views')).filter((name) => name.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(root, 'views', view), 'utf8');
    for (const match of html.matchAll(/(?:href|src)="(\/(?:css|js|img)\/[^"#]+)(?:#[^"]*)?"/g)) {
      if (!fs.existsSync(path.join(root, 'public', match[1].slice(1)))) {
        failed = true;
        console.error(`Recurso ausente en ${view}: ${match[1]}`);
      }
    }
  }

  process.exitCode = failed ? 1 : 0;
  console.log(`${checked} archivos JavaScript revisados. JSON y recursos HTML ${failed ? 'con errores' : 'válidos'}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
