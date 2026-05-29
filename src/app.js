const express = require('express');
const authRoutes = require('./routes/auth.routes');
const entidadeRoutes = require('./routes/entidade.routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Parse JSON
app.use(express.json());

// Log de requisições
app.use((req, res, next) => {
  const now = new Date().toISOString();
  console.log(`[${now}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rotas
app.use('/auth', authRoutes);
app.use('/entidades', entidadeRoutes);

// 404 para rotas não encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Tratamento global de erros (deve ser o último middleware)
app.use(errorHandler);

module.exports = app;
