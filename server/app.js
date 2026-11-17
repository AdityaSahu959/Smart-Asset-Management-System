const express = require('express');
const cors = require('cors');
const { authentication } = require('./middleware/auth');
const { AIClient } = require('./lib/aiClient');
const { errorHandler, HttpError } = require('./lib/errors');

function createApp({ db = require('./config/db'), secret = process.env.JWT_SECRET, mailer, aiClient, origins = process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173' } = {}) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw new Error('JWT_SECRET must contain at least 32 bytes; no fallback is permitted');
  const app = express();
  app.disable('x-powered-by');
  const allowedOrigins = origins.split(',').map(value => value.trim()).filter(Boolean);
  app.use(cors({ origin(origin, callback) { callback(null, !origin || allowedOrigins.includes(origin)); } }));
  app.use(express.json({ limit: '64kb' }));
  app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Cache-Control', 'no-store'); next(); });
  app.get('/', (req, res) => res.json({ message: 'Smart Asset Management API' }));
  app.use('/api/auth', require('./routes/authRoutes')(db, secret, mailer));
  const authenticated = authentication(db, secret);
  const ai = aiClient || new AIClient();
  app.get('/api/auth/me', authenticated, (req, res) => res.json({ user: req.user }));
  app.use('/api/labs', authenticated, require('./routes/labRoutes')(db));
  app.use('/api/categories', authenticated, require('./routes/categoryRoutes')(db));
  app.use('/api/assets', authenticated, require('./routes/assetRoutes')(db));
  app.use('/api/maintenance', authenticated, require('./routes/maintenanceRoutes')(db, ai));
  app.get('/api/ai/status', authenticated, (req, res) => res.json({ service_configured: Boolean(ai.key), breaker: ai.breaker.status() }));
  app.use('/api/reliability', authenticated, require('./routes/reliabilityRoutes')(db));
  app.use('/api/audit', authenticated, require('./routes/auditRoutes')(db));
  app.use('/api/users', authenticated, require('./routes/userRoutes')(db));
  app.use((req, res, next) => next(new HttpError(404, 'Endpoint not found')));
  app.use(errorHandler);
  return app;
}
module.exports = { createApp };

