const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).toString('utf8').split('\0').filter(Boolean);
const values = [];
for (const name of ['server/.env', 'server/.env.local', 'ai_service/.env.local']) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]*(?:PASSWORD|SECRET|KEY))=(.*)$/.exec(line);
    if (match) {
      const value = match[2].trim().replace(/^['"]|['"]$/g, '');
      if (value.length >= 16) values.push(value);
    }
  }
}
const problems = [];
for (const name of files) {
  if (/(^|\/)\.env(?:\.local)?$/.test(name) || /local-credentials\.json$|browser-login-.*\.json$|scripts\/local\.config\.json$/.test(name)) { problems.push(name); continue; }
  const file = path.join(root, name);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    const content = fs.readFileSync(file);
    if (values.some(value => content.includes(Buffer.from(value)))) problems.push(name);
  }
}
if (problems.length) { console.error('Private files or configured secret values found in source candidates: ' + [...new Set(problems)].join(', ')); process.exitCode = 1; }
else console.log('Source candidate scan passed: private configuration excluded; no configured long secret values found.');
