function errorHandler(err, req, res, next) {
  const isDev = process.env.NODE_ENV !== 'production';

  console.error(`[ERRO] ${req.method} ${req.path}:`, err.message);

  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Conflito de dados' });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Registro não encontrado' });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Token inválido' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expirado' });
  }

  if (err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  return res.status(500).json({
    error: 'Erro interno do servidor',
    detail: isDev ? err.message : undefined,
  });
}

module.exports = errorHandler;
