# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Commands

```bash
npm run dev            # watch mode (reads .env; copy .env.example first)
npm run build          # nest build -> dist/
npm run check          # typecheck + lint + format check + boundaries + unit tests — run before every commit
npm run test:e2e       # e2e tests on a Postgres 18 testcontainer (Docker required),
                       # or on an existing disposable database: TEST_DATABASE_URL=postgres://... npm run test:e2e
npm run db:generate    # drizzle-kit: generate a migration from changed *.tables.ts
npm run db:migrate     # apply migrations (built output; the API never migrates itself)
npm run openapi:export # write openapi.json from the running code's DTOs (after build)
```

## Architecture: modular monolith

One process, one Postgres database, strict module boundaries.

```
src/
  platform/            shared infrastructure only: config, database, http, logging, health
  modules/<name>/
    index.ts           the ONLY file other modules may import
    <name>.module.ts
    <name>.facade.ts   public interface used by other modules
    <name>.tables.ts   Drizzle tables in pgSchema('<name>')
    <name>.store.ts    queries against the module's own tables
    http/              <name>.controller.ts (/v1/...) and <name>-admin.controller.ts (/v1/admin/...)
```

Rules, enforced by `npm run arch` (dependency-cruiser), ESLint and `test/arch`:

- Import another module only through its `index.ts`. Never import its tables, store or services.
- Each module owns one Postgres schema. No foreign keys across schemas: store the other module's id as a plain `uuid`.
- Dependencies go one way. No cycles, no `forwardRef`. If two modules need each other, move the orchestration to the one that depends on the other, or invert with an interface declared by the lower module.
- `platform/` never imports from `modules/`.
- Events (`EventEmitter2`) are for optional side effects only; delivery is not guaranteed. The event contract is exported from the publishing module's `index.ts`.

## Conventions

- Configuration: add every variable to `src/platform/config/env.schema.ts`; never read `process.env` elsewhere. Secrets go into `SECRET_KEYS` so production refuses weak values.
- Transactions: stores inject `TransactionHost` (`DbTxHost`) and use `txHost.tx`. Wrap multi-step writes in `@Transactional()`; nested facade calls join it automatically.
- Ids: `primaryId()` from `platform/database` (Postgres 18 `uuidv7()`). Money: integer kopecks.
- HTTP: DTOs are zod schemas via `createZodDto`; errors are problem+json — throw `AppError` with a stable `code`.
- Names: use the conventional domain terms (tours, points, favorites, reviews, promo codes, orders, purchases).
