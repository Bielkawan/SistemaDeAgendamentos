# NR Studio – Sistema de agendamentos

Monorepo com:

- `web/` – React 19 + Vite + TypeScript. Página pública `/agendar` (cliente agenda sozinha, sem login), `/agendamento/:token` (consultar/cancelar) e painel `/admin` (somente a administradora).
- `api/` – Express 5 + TypeScript + Prisma + PostgreSQL (Supabase) + Zod.

## Rodando localmente

```bash
# banco local (ou use o Supabase)
docker run -d --name agenda-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=agenda -p 5432:5432 postgres:16-alpine

cd api
cp .env.example .env        # ajuste DATABASE_URL, DIRECT_URL, JWT_SECRET, ADMIN_*
npm install
npx prisma migrate deploy
npm run db:seed             # cria admin, horários, serviços e produtos iniciais
npm run dev                 # http://localhost:3333

cd ../web
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173 (proxy /api -> 3333)
```

Testes da API (precisam do banco rodando e do seed): `cd api && npm test`.

## Conectando no Supabase

1. Project Settings → Database → Connection string.
2. `DATABASE_URL` = pooler (porta 6543, `?pgbouncer=true`); `DIRECT_URL` = conexão direta (porta 5432).
3. `npx prisma migrate deploy && npm run db:seed`.

A migration habilita `btree_gist` e liga RLS em todas as tabelas sem policies: o acesso via chave `anon` do Supabase fica bloqueado e só a API (usuário `postgres`) lê/escreve.

## Regras de agenda e segurança

- Horários salvos em UTC, convertidos no fuso do studio (`America/Sao_Paulo`).
- Disponibilidade calculada na hora: expediente − bloqueios − agendamentos ativos, considerando duração + buffer, intervalo de slot, antecedência mínima e janela máxima.
- Double booking impedido no banco (`EXCLUDE USING gist` por profissional e intervalo); conflito → HTTP 409. Teste com 8 reservas simultâneas no mesmo horário garante 1 sucesso.
- `POST /v1/public/appointments` exige `Idempotency-Key` (clique duplo/retry não duplica).
- Rate limit nas rotas públicas e no login; honeypot anti-bot; bloqueio de conta após 5 senhas erradas.
- Admin: access token JWT curto (15 min) + refresh token rotativo em cookie httpOnly, com detecção de reuso.
- Clientes online entram como "Aguardando" (ou confirmadas automaticamente, se configurado). Cancelamento pela cliente respeita a antecedência configurada.
- Concluir atendimento lança a receita no financeiro automaticamente; saída de estoque nunca deixa saldo negativo.
- Exclusão de cliente anonimiza os dados (LGPD) e mantém o histórico financeiro.

## API (prefixo `/v1`)

| Área | Rotas |
| --- | --- |
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| Pública | `GET /public/studio`, `GET /public/availability`, `POST /public/appointments`, `GET /public/appointments/:token`, `POST /public/appointments/:token/cancel` |
| Admin | `dashboard`, `reports`, `search`, `availability`, `appointments` (+ `/:id/status`), `clients`, `services`, `professionals`, `time-offs`, `products` (+ `/summary`, `/:id/movements`), `finance/summary`, `finance/transactions`, `settings` |

## Deploy

- API: qualquer host Node 20+ (Render, Railway, Fly). `npm ci && npm run build && npx prisma migrate deploy && npm start`. Em produção defina `NODE_ENV=production`, `CORS_ORIGIN` com o domínio do front e um `JWT_SECRET` forte.
- `render.yaml` usa o plano **free** (a API dorme após 15 min sem uso; primeira requisição leva ~30–60s). Para cliente em produção, troque para `starter` no painel do Render.
- Front: `npm run build` e publique `web/dist` (Vercel/Netlify) com `VITE_API_URL` apontando para a API (`https://api.seudominio.com`). Configure rewrite de SPA para `index.html`.
- Se front e API ficarem em domínios diferentes, o cookie de refresh usa `SameSite=None; Secure`.
