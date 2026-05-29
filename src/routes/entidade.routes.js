const { Router } = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const { criar, submeter, finalizar } = require('../controllers/entidade.controller');

const router = Router();

// Todas as rotas de entidades exigem autenticação
router.use(authMiddleware);

// POST /entidades
router.post('/', criar);

// POST /entidades/:id/submeter
router.post('/:id/submeter', submeter);

// POST /entidades/:id/finalizar
router.post('/:id/finalizar', finalizar);

module.exports = router;
