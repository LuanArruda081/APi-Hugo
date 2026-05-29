const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // Cria o registro único de controle do pool global
  const pool = await prisma.poolControl.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      totalVagas: 100,
      vagasUsadas: 0,
    },
  });

  console.log(`✅ PoolControl criado: ${pool.vagasUsadas}/${pool.totalVagas} vagas usadas`);
  console.log('🌱 Seed concluído!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
