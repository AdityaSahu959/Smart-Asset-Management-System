const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function configure({ serverEnv, workerEnv, cacheDir }) {
  const current = fs.readFileSync(serverEnv, 'utf8');
  if (fs.existsSync(workerEnv) || /^AI_SERVICE_KEY=/m.test(current)) throw new Error('AI configuration already exists; refusing to overwrite it');
  const key = crypto.randomBytes(48).toString('hex');
  fs.mkdirSync(path.dirname(workerEnv), { recursive: true });
  fs.writeFileSync(workerEnv, 'AI_SERVICE_KEY=' + key + '\nHF_HOME=' + cacheDir + '\nHF_HUB_DISABLE_SYMLINKS_WARNING=1\nHF_HUB_DISABLE_XET=1\nHF_HUB_DISABLE_TELEMETRY=1\n', { flag: 'wx', mode: 0o600 });
  try {
    fs.appendFileSync(serverEnv, '\nAI_SERVICE_URL=http://127.0.0.1:8000\nAI_SERVICE_KEY=' + key + '\nAI_TIMEOUT_MS=3000\nAI_BREAKER_THRESHOLD=3\nAI_BREAKER_RESET_MS=30000\n');
  } catch (error) { fs.unlinkSync(workerEnv); throw error; }
}
if (require.main === module) {
  try {
    const root = path.resolve(__dirname, '..', '..');
    const local = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'local.config.json'), 'utf8'));
    configure({ serverEnv: path.join(root, 'server', '.env.local'), workerEnv: path.join(root, 'ai_service', '.env.local'), cacheDir: path.join(path.dirname(local.dataDir), 'ai-model-cache') });
    console.log('AI configuration created privately. No keys were printed.');
  } catch { console.error('AI configuration was not created. Verify existing local setup; private details suppressed.'); process.exitCode = 1; }
}
module.exports = { configure };
