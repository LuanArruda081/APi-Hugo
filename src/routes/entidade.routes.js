const { Router } = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const { criar, submeter, finalizar } = require('../controllers/entidade.controller');

const router = Router();

router.use(authMiddleware);

router.post('/', criar);
router.post('/:id/submeter', submeter);
router.post('/:id/finalizar', finalizar);

module.exports = router;
