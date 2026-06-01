const { Router } = require('express');
const { registrar, login } = require('../controllers/auth.controller');

const router = Router();

router.post('/registrar', registrar);
router.post('/login', login);

module.exports = router;
