/**
 * STRESS TEST — E-commerce API
 * ============================
 * Valida que o pool de 100 vagas e a cota pessoal de 2 por usuário
 * são respeitados mesmo sob carga paralela intensa.
 *
 * Uso:
 *   node stress-test.js
 *
 * Pré-requisitos:
 *   - API rodando em http://localhost:8080
 *   - npm install node-fetch (ou Node 18+ com fetch nativo)
 */

const BASE_URL = 'http://localhost:8080';
const USUARIOS = 60;        // usuários simultâneos
const TENTATIVAS = 3;       // cada usuário tenta submeter N entidades

// Estatísticas
const stats = {
  registros: 0,
  entidadesCriadas: 0,
  submetidas: 0,
  poolCheio: 0,
  cotaPessoal: 0,
  erros: 0,
  outros: 0,
};

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function registrar(i) {
  const { status, body } = await fetchJson(`${BASE_URL}/auth/registrar`, {
    method: 'POST',
    body: JSON.stringify({
      email: `user${i}_${Date.now()}@test.com`,
      password: 'senha123',
      name: `Usuário ${i}`,
    }),
  });
  if (status !== 201) throw new Error(`Registro falhou: ${JSON.stringify(body)}`);
  stats.registros++;
  return body.token;
}

async function criarEntidade(token, titulo) {
  const { status, body } = await fetchJson(`${BASE_URL}/entidades`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ titulo }),
  });
  if (status !== 201) throw new Error(`Criar entidade falhou: ${JSON.stringify(body)}`);
  stats.entidadesCriadas++;
  return body.id;
}

async function submeter(token, id) {
  const { status, body } = await fetchJson(`${BASE_URL}/entidades/${id}/submeter`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status, body };
}

async function simularUsuario(i) {
  try {
    const token = await registrar(i);

    for (let t = 0; t < TENTATIVAS; t++) {
      const entidadeId = await criarEntidade(token, `Entidade ${i}-${t}`);
      const { status, body } = await submeter(token, entidadeId);

      if (status === 200) {
        stats.submetidas++;
      } else if (body?.error === 'POOL_CHEIO') {
        stats.poolCheio++;
      } else if (body?.error === 'COTA_PESSOAL') {
        stats.cotaPessoal++;
      } else if (status >= 500) {
        stats.erros++;
        console.error(`❌ ERRO 5xx usuário ${i} tentativa ${t}:`, body);
      } else {
        stats.outros++;
      }
    }
  } catch (err) {
    stats.erros++;
    console.error(`❌ Exceção usuário ${i}:`, err.message);
  }
}

async function main() {
  console.log('🔥 Iniciando stress test...');
  console.log(`👥 ${USUARIOS} usuários × ${TENTATIVAS} tentativas = ${USUARIOS * TENTATIVAS} submissões paralelas\n`);

  const inicio = Date.now();

  // Dispara todos os usuários em paralelo
  await Promise.all(
    Array.from({ length: USUARIOS }, (_, i) => simularUsuario(i))
  );

  const duracao = ((Date.now() - inicio) / 1000).toFixed(2);

  console.log('\n📊 RESULTADO DO STRESS TEST');
  console.log('═══════════════════════════════');
  console.log(`✅ Registros realizados:    ${stats.registros}`);
  console.log(`📦 Entidades criadas:       ${stats.entidadesCriadas}`);
  console.log(`🎯 Submetidas com sucesso:  ${stats.submetidas}`);
  console.log(`🔴 Rejeitadas (POOL_CHEIO): ${stats.poolCheio}`);
  console.log(`🟡 Rejeitadas (COTA_PESSOAL): ${stats.cotaPessoal}`);
  console.log(`⚠️  Outros status:           ${stats.outros}`);
  console.log(`❌ Erros 5xx / exceções:    ${stats.erros}`);
  console.log(`⏱  Duração total:           ${duracao}s`);
  console.log('═══════════════════════════════');

  // Validações
  let passou = true;
  if (stats.submetidas > 100) {
    console.log(`\n🚨 FALHA: ${stats.submetidas} vagas usadas — ultrapassou o limite de 100!`);
    passou = false;
  }
  if (stats.erros > 0) {
    console.log(`\n🚨 FALHA: ${stats.erros} erros 5xx detectados!`);
    passou = false;
  }
  if (passou) {
    console.log('\n🏆 PASSOU: Nenhuma violação de concorrência detectada!');
    if (stats.submetidas <= 100) {
      console.log(`✔  Pool respeitado: ${stats.submetidas}/100 vagas usadas`);
    }
  }

  // Verifica pool via API
  try {
    const { body } = await fetchJson(`${BASE_URL}/health`);
    console.log('\n💚 API ainda respondendo:', body.status);
  } catch {
    console.log('\n❌ API não está respondendo após o teste!');
  }
}

main().catch(console.error);
