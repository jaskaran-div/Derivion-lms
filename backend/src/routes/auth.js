const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const {
  register, login, refreshToken, logout,
  forgotPassword, resetPassword,
  getMe, updateProfile, changePassword,
} = require('../controllers/authController');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');

router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
  ],
  validate,
  register
);

router.post(
  '/login',
  [
    body('email').optional().trim(),
    body('username').optional().trim(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  login
);

router.post('/refresh', refreshToken);
router.post('/logout', optionalAuth, logout);
router.post('/forgot-password', body('email').isEmail(), validate, forgotPassword);
router.post('/reset-password', [body('token').notEmpty(), body('password').isLength({ min: 8 })], validate, resetPassword);

router.get('/me', authenticate, getMe);
router.put('/me', authenticate, updateProfile);
router.post('/change-password', authenticate, changePassword);

module.exports = router;
