const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const pool = await prisma.poolControl.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      totalVagas: 100,
      vagasUsadas: 0,
    },
  });

  console.log(`Pool iniciado: ${pool.vagasUsadas}/${pool.totalVagas} vagas usadas`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
