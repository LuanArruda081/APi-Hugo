const prisma = require('../utils/prisma');

const LIMITE_POOL = 100;
const LIMITE_USUARIO = 2;

async function criar(req, res, next) {
  try {
    const { titulo, descricao } = req.body;

    if (!titulo) {
      return res.status(400).json({ error: 'titulo é obrigatório' });
    }

    const entidade = await prisma.entidade.create({
      data: {
        titulo,
        descricao: descricao || null,
        status: 'RASCUNHO',
        userId: req.user.id,
      },
    });

    return res.status(201).json(entidade);
  } catch (err) {
    next(err);
  }
}

async function submeter(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const resultado = await prisma.$transaction(async (tx) => {
      const entidade = await tx.entidade.findUnique({ where: { id } });

      if (!entidade || entidade.userId !== userId) {
        return { status: 404, body: { error: 'Entidade não encontrada' } };
      }

      if (entidade.status !== 'RASCUNHO') {
        return { status: 400, body: { error: `Entidade já está com status ${entidade.status}` } };
      }

      // lock pessimista no pool para evitar race condition
      const [pool] = await tx.$queryRaw`
        SELECT id, "totalVagas", "vagasUsadas"
        FROM pool_control
        WHERE id = 1
        FOR UPDATE
      `;

      if (!pool) {
        throw new Error('PoolControl não encontrado');
      }

      const [cotaUsuario] = await tx.$queryRaw`
        SELECT COUNT(*) as total
        FROM entidades
        WHERE "userId" = ${userId}
          AND status IN ('PROCESSANDO', 'CONCLUIDO')
      `;

      const vagasDoUsuario = parseInt(cotaUsuario.total, 10);

      if (vagasDoUsuario >= LIMITE_USUARIO) {
        return { status: 400, body: { error: 'COTA_PESSOAL' } };
      }

      if (parseInt(pool.vagasUsadas, 10) >= LIMITE_POOL) {
        return { status: 400, body: { error: 'POOL_CHEIO' } };
      }

      await tx.$executeRaw`
        UPDATE pool_control
        SET "vagasUsadas" = "vagasUsadas" + 1
        WHERE id = 1
      `;

      const atualizada = await tx.entidade.update({
        where: { id },
        data: { status: 'PROCESSANDO' },
      });

      return { status: 200, body: atualizada };
    }, {
      isolationLevel: 'Serializable',
      timeout: 10000,
    });

    return res.status(resultado.status).json(resultado.body);
  } catch (err) {
    next(err);
  }
}

async function finalizar(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const entidade = await prisma.entidade.findUnique({ where: { id } });

    if (!entidade || entidade.userId !== userId) {
      return res.status(404).json({ error: 'Entidade não encontrada' });
    }

    if (entidade.status !== 'PROCESSANDO') {
      return res.status(400).json({
        error: `Apenas entidades PROCESSANDO podem ser finalizadas. Status atual: ${entidade.status}`,
      });
    }

    const atualizada = await prisma.entidade.update({
      where: { id },
      data: { status: 'CONCLUIDO' },
    });

    return res.json(atualizada);
  } catch (err) {
    next(err);
  }
}

module.exports = { criar, submeter, finalizar };
