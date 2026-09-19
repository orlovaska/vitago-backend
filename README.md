# vitago-backend

API of the Vitago audio guide apps: tours and points with narrated audio, payments, promo codes,
favorites, reviews and the desktop administration.

A NestJS modular monolith on PostgreSQL 18 with Drizzle ORM. See [CLAUDE.md](CLAUDE.md) for the
architecture rules.

## Local development

Requirements: Node.js 22.12+, Docker.

```bash
npm install
cp .env.example .env    # point DATABASE_URL at a local Postgres 18
npm run build && npm run db:migrate
npm run dev             # http://localhost:3000, docs at /v1/docs
```

## Checks

```bash
npm run check      # typecheck, lint, formatting, module boundaries, unit tests
npm run test:e2e   # end-to-end tests against a throwaway Postgres container
```
