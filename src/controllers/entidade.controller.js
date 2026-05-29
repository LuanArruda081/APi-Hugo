const prisma = require('../utils/prisma');

const POOL_TOTAL = 100;
const COTA_POR_USUARIO = 2;

/**
 * POST /entidades
 * Cria uma nova entidade com status RASCUNHO para o usuário autenticado.
 */
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

/**
 * POST /entidades/:id/submeter
 *
 * Lógica crítica com lock pessimista (SELECT FOR UPDATE):
 * 1. Abre transação
 * 2. Bloqueia o registro PoolControl para evitar race conditions
 * 3. Conta quantas vagas o usuário já usou
 * 4. Verifica cota pessoal (máx 2 por usuário)
 * 5. Verifica pool global (máx 100)
 * 6. Atualiza o PoolControl e a Entidade atomicamente
 *
 * Nunca ultrapassará 100 vagas globais nem 2 por usuário,
 * mesmo com centenas de requisições simultâneas.
 */
async function submeter(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const resultado = await prisma.$transaction(async (tx) => {
      // ------------------------------------------------------------------
      // 1. Verifica se a entidade existe E pertence ao usuário autenticado
      // ------------------------------------------------------------------
      const entidade = await tx.entidade.findUnique({
        where: { id },
      });

      if (!entidade || entidade.userId !== userId) {
        return { status: 404, body: { error: 'Entidade não encontrada' } };
      }

      if (entidade.status !== 'RASCUNHO') {
        return {
          status: 400,
          body: { error: `Entidade já está com status ${entidade.status}` },
        };
      }

      // ------------------------------------------------------------------
      // 2. SELECT FOR UPDATE no PoolControl — bloqueia a linha inteira
      //    até o commit, impedindo leituras sujas e race conditions.
      // ------------------------------------------------------------------
      const [poolRow] = await tx.$queryRaw`
        SELECT id, "totalVagas", "vagasUsadas"
        FROM pool_control
        WHERE id = 1
        FOR UPDATE
      `;

      if (!poolRow) {
        throw new Error('PoolControl não inicializado. Execute o seed.');
      }

      // ------------------------------------------------------------------
      // 3. Conta vagas já usadas por este usuário (dentro da transação)
      // ------------------------------------------------------------------
      const [cotaRow] = await tx.$queryRaw`
        SELECT COUNT(*) as total
        FROM entidades
        WHERE "userId" = ${userId}
          AND status IN ('PROCESSANDO', 'CONCLUIDO')
      `;
      const vagasDoUsuario = parseInt(cotaRow.total, 10);

      // ------------------------------------------------------------------
      // 4. Regra: máximo 2 vagas por usuário
      // ------------------------------------------------------------------
      if (vagasDoUsuario >= COTA_POR_USUARIO) {
        return { status: 400, body: { error: 'COTA_PESSOAL' } };
      }

      // ------------------------------------------------------------------
      // 5. Regra: pool global de 100 vagas
      // ------------------------------------------------------------------
      if (parseInt(poolRow.vagasUsadas, 10) >= POOL_TOTAL) {
        return { status: 400, body: { error: 'POOL_CHEIO' } };
      }

      // ------------------------------------------------------------------
      // 6. Atualiza PoolControl e Entidade atomicamente
      // ------------------------------------------------------------------
      await tx.$executeRaw`
        UPDATE pool_control
        SET "vagasUsadas" = "vagasUsadas" + 1
        WHERE id = 1
      `;

      const entidadeAtualizada = await tx.entidade.update({
        where: { id },
        data: { status: 'PROCESSANDO' },
      });

      return { status: 200, body: entidadeAtualizada };
    }, {
      // Nível de isolamento máximo para garantir consistência
      isolationLevel: 'Serializable',
      timeout: 10000,
    });

    return res.status(resultado.status).json(resultado.body);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /entidades/:id/finalizar
 * Muda status de PROCESSANDO para CONCLUIDO.
 * Só o dono da entidade pode finalizar.
 */
async function finalizar(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verifica existência e ownership
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
