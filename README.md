# E-commerce API — Hugo
API REST Node.js com controle de vagas concorrente, autenticação JWT e PostgreSQL.

---

# Visão Geral

| Item | Valor |
|---|---|
| Runtime | Node.js 20 |
| Framework | Express 4 |
| Banco de Dados | PostgreSQL 16 |
| ORM | Prisma 5 |
| Autenticação | JWT (Bearer Token) |
| Porta | **8080** |
| Pool de Vagas | **100 vagas globais** |
| Cota por Usuário | **máximo 2 vagas** |

---

# Estrutura do Projeto

```
ecommerce-api/
├── prisma/
│   ├── schema.prisma          # Modelos do banco (User, Entidade, PoolControl)
│   ├── seed.js                # Inicializa o PoolControl com 100 vagas
│   └── migrations/
│       └── 20240101000000_init/migration.sql
├── src/
│   ├── server.js              # Ponto de entrada — inicia o servidor na porta 8080
│   ├── app.js                 # Configuração do Express, rotas e error handler
│   ├── controllers/
│   │   ├── auth.controller.js     # Registrar e Login
│   │   └── entidade.controller.js # Criar, Submeter (lock pessimista), Finalizar
│   ├── middlewares/
│   │   ├── auth.middleware.js  # Verifica JWT e injeta req.user
│   │   └── errorHandler.js    # Tratamento global de erros sem expor internos
│   ├── routes/
│   │   ├── auth.routes.js     # POST /auth/registrar, /auth/login
│   │   └── entidade.routes.js # POST /entidades, /:id/submeter, /:id/finalizar
│   └── utils/
│       └── prisma.js          # Singleton do PrismaClient
├── stress-test.js             # Teste de estresse — 60 usuários em paralelo
├── Dockerfile                 # Imagem da API Node.js
├── docker-compose.yml         # API + PostgreSQL orquestrados
├── package.json
├── .env.example
└── README.md
```

---

# Como Rodar

### Pré-requisitos
- [Docker](https://docs.docker.com/get-docker/) instalado
- [Docker Compose](https://docs.docker.com/compose/install/) instalado

### 1. Clone / copie o projeto

```bash
cd ecommerce-api
```

### 2. Suba os containers

```bash
docker compose up --build
```

O Docker vai:
1. Subir o PostgreSQL 16
2. Aguardar o banco ficar saudável
3. Rodar `prisma migrate deploy` (cria tabelas)
4. Rodar `node prisma/seed.js` (cria o PoolControl com 100 vagas)
5. Iniciar a API na porta **8080**

### 3. Verifique que está rodando

```bash
curl http://localhost:8080/health
# {"status":"ok","timestamp":"..."}
```

---

## 📡 Endpoints

### Autenticação

#### `POST /auth/registrar`
Cria conta e retorna JWT.

```bash
curl -X POST http://localhost:8080/auth/registrar \
  -H "Content-Type: application/json" \
  -d '{"email":"joao@email.com","password":"senha123","name":"João"}'
```

**Resposta 201:**
```json
{
  "user": { "id": "uuid", "email": "joao@email.com", "name": "João" },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

#### `POST /auth/login`

```bash
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"joao@email.com","password":"senha123"}'
```

---

### Entidades (requer `Authorization: Bearer <token>`)

#### `POST /entidades`
Cria uma entidade com status `RASCUNHO`.

```bash
curl -X POST http://localhost:8080/entidades \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Produto X","descricao":"Descrição opcional"}'
```

---

#### `POST /entidades/:id/submeter`
Tenta ocupar uma vaga no pool global.

- Usa `SELECT FOR UPDATE` + `SERIALIZABLE` transaction
- Sem race conditions, sem deadlocks

**Respostas possíveis:**

| Status | Body | Motivo |
|---|---|---|
| 200 | `{ ...entidade, status: "PROCESSANDO" }` | Vaga alocada |
| 400 | `{ "error": "POOL_CHEIO" }` | 100 vagas esgotadas |
| 400 | `{ "error": "COTA_PESSOAL" }` | Usuário já tem 2 vagas |
| 404 | `{ "error": "Entidade não encontrada" }` | ID errado ou de outro usuário |

```bash
curl -X POST http://localhost:8080/entidades/UUID_AQUI/submeter \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

#### `POST /entidades/:id/finalizar`
Muda de `PROCESSANDO` → `CONCLUIDO`.

```bash
curl -X POST http://localhost:8080/entidades/UUID_AQUI/finalizar \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

## 🔒 Controle de Concorrência

### Problema resolvido
Sem proteção, duas requisições simultâneas podem ler `vagasUsadas = 99`, ambas decidem que há vaga, e o banco termina com 101 vagas — violando a regra.

### Solução implementada

```sql
-- Dentro de uma transaction SERIALIZABLE:
SELECT id, "totalVagas", "vagasUsadas"
FROM pool_control
WHERE id = 1
FOR UPDATE;          -- ← bloqueia a linha para escrita exclusiva
```

O `FOR UPDATE` garante que somente uma transação por vez pode ler e modificar o `PoolControl`. As demais ficam em fila e executam após o commit da anterior — já com o contador atualizado.

**Garantias:**
- ✅ Nunca ultrapassa 100 vagas
- ✅ Nunca ultrapassa 2 vagas por usuário
- ✅ Sem race conditions
- ✅ Sem deadlocks (acesso sempre na mesma ordem)
- ✅ Sem erros 500 em concorrência

---

## 🔥 Stress Test

Testa 60 usuários em paralelo, cada um tentando 3 submissões (180 tentativas para 100 vagas).

```bash
# Certifique-se que a API está rodando
node stress-test.js
```

**Saída esperada:**
```
📊 RESULTADO DO STRESS TEST
═══════════════════════════════
✅ Registros realizados:    60
📦 Entidades criadas:       180
🎯 Submetidas com sucesso:  100   ← nunca mais que 100
🔴 Rejeitadas (POOL_CHEIO): 60
🟡 Rejeitadas (COTA_PESSOAL): 20
❌ Erros 5xx / exceções:    0     ← zero erros
🏆 PASSOU: Nenhuma violação de concorrência detectada!
```

---

## 🗄️ Modelos do Banco

### `users`
| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID | PK |
| email | String | Único |
| password | String | Bcrypt hash |
| name | String | Nome do usuário |

### `entidades`
| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID | PK |
| titulo | String | Título obrigatório |
| descricao | String? | Opcional |
| status | Enum | RASCUNHO / PROCESSANDO / CONCLUIDO |
| userId | UUID | FK → users |

### `pool_control`
| Campo | Tipo | Descrição |
|---|---|---|
| id | Int | Sempre 1 (singleton) |
| totalVagas | Int | 100 (fixo) |
| vagasUsadas | Int | Contador atômico |

---

## ⚙️ Variáveis de Ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `DATABASE_URL` | — | URL do PostgreSQL |
| `JWT_SECRET` | — | Chave de assinatura do JWT |
| `JWT_EXPIRES_IN` | `7d` | Expiração do token |
| `PORT` | `8080` | Porta da API |

---

## 🛑 Parar os containers

```bash
docker compose down          # para e remove containers
docker compose down -v       # também remove o volume do banco
```
