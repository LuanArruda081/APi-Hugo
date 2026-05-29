const { Router } = require('express');
const { registrar, login } = require('../controllers/auth.controller');

const router = Router();

// POST /auth/registrar
router.post('/registrar', registrar);

// POST /auth/login
router.post('/login', login);

module.exports = router;
