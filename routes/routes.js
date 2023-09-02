const express = require('express');
const bodyParser = require('body-parser').json();
const adminController = require('../controllers/adminController');
const userController = require('../controllers/userController');

const router = express.Router();

// Admin signup
router.post('/api/admin/signup', bodyParser, adminController.adminSignup);

// Admin login
router.post('/api/admin/login', bodyParser, adminController.adminLogin);

// Add admin role info
router.post('/api/admin/addAdminRoleInfo', bodyParser, adminController.addAdminRoleInfo);

// User sign up
router.post('/api/user/signup', bodyParser, userController.userSignup);

// User login
router.post('/api/user/login', bodyParser, userController.userLogin);

module.exports = router;
