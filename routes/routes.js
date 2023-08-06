const express = require('express');
const bodyParser = require('body-parser').json();
const adminController = require('../controllers/adminController');

const router = express.Router();

// Admin signup
router.post('/api/admin/signup', bodyParser, adminController.adminSignup);

// Admin login
router.post('/api/admin/login', bodyParser, adminController.adminLogin);

module.exports = router;
