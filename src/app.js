const express = require('express');
const authRoutes = require('./routes/auth.routes');
const entidadeRoutes = require('./routes/entidade.routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.use(express.json());

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/auth', authRoutes);
app.use('/entidades', entidadeRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.use(errorHandler);

module.exports = app;
