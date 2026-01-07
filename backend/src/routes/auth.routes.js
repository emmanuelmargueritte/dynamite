const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { validate } = require('../middlewares/validate');
const AuthController = require('../controllers/authController');

const router = express.Router();

router.get('/csrf', asyncHandler(AuthController.getCsrfToken));

router.post('/register',
  validate({ email: { required: true, type: 'email' }, password: { required: true, type: 'string', min: 8, max: 200 } }),
  asyncHandler(AuthController.register)
);

router.post('/login',
  validate({ email: { required: true, type: 'email' }, password: { required: true, type: 'string', min: 8, max: 200 } }),
  asyncHandler(AuthController.login)
);

router.post('/logout', asyncHandler(AuthController.logout));
router.get('/me', asyncHandler(AuthController.me));

module.exports = router;
