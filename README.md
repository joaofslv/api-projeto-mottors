# API Projeto Mottors

Backend com TypeScript, Express, Prisma e PostgreSQL.

## Executar localmente

1. Instale as dependências: `npm install`.
2. Copie `.env.example` para `.env` se ainda não tiver um arquivo local.
3. Gere uma chave com `openssl rand -hex 32` e preencha `JWT_SECRET` no `.env`.
4. Suba o banco: `docker compose up -d`.
5. Aplique as migrations: `npx prisma migrate dev`.
6. Inicie a API: `npm run dev`.

Nunca envie o `.env` para o GitHub.

## Login com JWT

Cadastre uma conta em `POST /auth/register` com `type` (`PERSON` ou `COMPANY`), `name`, `email` e `password` (mínimo de 8 caracteres).

Envie `POST /auth/login`, com `Content-Type: application/json`:

```json
{"email":"joao@example.com","password":"sua-senha"}
```

A resposta contém `data.access_token`, `data.token_type` e `data.expires_in` (3600 segundos).

Para consultar `GET /auth/me`, envie o header:

```text
Authorization: Bearer SEU_ACCESS_TOKEN
```

O middleware verifica assinatura, algoritmo, emissor, destinatário, expiração e se a conta continua ativa. Senhas e seus hashes não são retornados. Login inválido retorna 401; corpo inválido retorna 422.

O token contém apenas identificação e metadados de autenticação. JWT é assinado, não criptografado. Esta etapa ainda não inclui refresh token, revogação por sessão, recuperação de senha ou limitação de tentativas de login.

## Verificação

- `npm run typecheck`: verifica os tipos.
- `npm test`: testes HTTP de autenticação com operações Prisma simuladas, sem alterar o PostgreSQL.
