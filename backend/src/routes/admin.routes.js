const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { validate } = require('../middlewares/validate');
const authRequired = require('../middlewares/authRequired');
const auditLog = require('../middlewares/auditLog');
const AdminController = require('../controllers/adminController');

const router = express.Router();

router.post('/login',
  validate({ email: { required: true, type: 'email' }, password: { required: true, type: 'string', min: 8, max: 200 } }),
  auditLog('ADMIN_LOGIN_ATTEMPT'),
  asyncHandler(AdminController.login)
);

router.post('/logout', authRequired, auditLog('ADMIN_LOGOUT'), asyncHandler(AdminController.logout));
router.get('/me', authRequired, asyncHandler(AdminController.me));

router.post('/admins',
  authRequired,
  auditLog('ADMIN_CREATE'),
  validate({ email: { required: true, type: 'email' }, password: { required: true, type: 'string', min: 12, max: 200 } }),
  asyncHandler(AdminController.createAdmin)
);

module.exports = router;
