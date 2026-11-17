const nodemailer = require('nodemailer');
function configured() { return ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM', 'PUBLIC_APP_URL'].every(key => Boolean(process.env[key])); }
async function sendPasswordReset({ email, token }) {
  if (!configured()) throw new Error('Verified email delivery is not configured');
  const base = new URL(process.env.PUBLIC_APP_URL);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname))) throw new Error('PUBLIC_APP_URL requires HTTPS outside loopback');
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
    logger: false, debug: false,
  });
  const link = new URL('/reset-password', base);
  link.hash = 'token=' + token;
  await transport.sendMail({
    from: process.env.SMTP_FROM, to: email, subject: 'Smart Assets password recovery',
    text: 'Use this single-use link within 15 minutes to reset your password:\n' + link.href + '\nIf you did not request this, ignore this message.',
  });
}
module.exports = { configured, sendPasswordReset };

