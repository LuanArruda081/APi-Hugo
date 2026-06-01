const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');

async function registrar(req, res, next) {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password e name são obrigatórios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter ao menos 6 caracteres' });
    }

    const usuarioExistente = await prisma.user.findUnique({ where: { email } });
    if (usuarioExistente) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    const senhaHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, password: senhaHash, name },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    const token = gerarToken(user.id);

    return res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email e password são obrigatórios' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const senhaCorreta = await bcrypt.compare(password, user.password);
    if (!senhaCorreta) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = gerarToken(user.id);

    return res.json({
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
  } catch (err) {
    next(err);
  }
}

function gerarToken(userId) {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

module.exports = { registrar, login };
