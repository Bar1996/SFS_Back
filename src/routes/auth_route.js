const express = require('express');
const router = express.Router();
const auth_controller = require('../controllers/auth_controller.js');

router.post('/signup', auth_controller.SignUpWithEmailAndPassword);
router.post('/login', auth_controller.LoginWithEmailAndPassword);
router.post('/post_email', auth_controller.PostEmail);
router.post('/post_password', auth_controller.PostPassword);
router.get('/refresh', auth_controller.refresh);
router.get('/logout', auth_controller.logout);

module.exports = router;