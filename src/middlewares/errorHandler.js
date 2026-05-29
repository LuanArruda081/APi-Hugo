/**
 * Middleware de tratamento global de erros.
 * Captura qualquer erro não tratado nas rotas e retorna
 * uma resposta JSON padronizada sem expor stack traces em produção.
 */
function errorHandler(err, req, res, next) {
  const isDev = process.env.NODE_ENV !== 'production';

  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  if (isDev) {
    console.error(err.stack);
  }

  // Erros de validação do Prisma (ex: violação de unique)
  if (err.code === 'P2002') {
    return res.status(409).json({
      error: 'Conflito de dados',
      detail: isDev ? err.message : undefined,
    });
  }

  // Erros de registro não encontrado no Prisma
  if (err.code === 'P2025') {
    return res.status(404).json({
      error: 'Registro não encontrado',
    });
  }

  // Erros de JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Token inválido' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expirado' });
  }

  // Erro customizado com statusCode
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      error: err.message,
    });
  }

  // Erro genérico — nunca expõe detalhes internos em produção
  return res.status(500).json({
    error: 'Erro interno do servidor',
    detail: isDev ? err.message : undefined,
  });
}

module.exports = errorHandler;
