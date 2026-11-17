// Single-process limiter. Use a shared store before multi-instance deployment.
module.exports = function rateLimit({ limit = 20, windowMs = 15 * 60 * 1000 } = {}) {
  const clients = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, entry] of clients) if (entry.until <= now) clients.delete(key);
    const key = req.ip;
    const entry = clients.get(key) || { count: 0, until: now + windowMs };
    entry.count++;
    clients.set(key, entry);
    if (entry.count > limit) {
      res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
      return res.status(429).json({ message: 'Too many attempts. Please try again later.' });
    }
    next();
  };
};

