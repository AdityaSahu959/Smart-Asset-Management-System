const express = require('express');
const authController = require('../controllers/authController');
const rateLimit = require('../middleware/rateLimit');
module.exports = function authRoutes(db, secret, mailer) {
  const router = express.Router();
  const controller = authController(db, secret, mailer);
  router.get('/recovery-status', controller.recoveryStatus);
  const limiter = rateLimit();
  router.post('/register', limiter, controller.registerUser);
  router.post('/login', limiter, controller.loginUser);
  router.post('/forgot-password', limiter, controller.forgotPassword);
  router.post('/reset-password', limiter, controller.resetPassword);
  return router;
};
