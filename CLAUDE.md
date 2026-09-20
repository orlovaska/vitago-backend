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
npm run openapi:export # regenerate openapi.json (after build); commit it with every API change
npm run admin -- create <login>   # create an administrator (prints a generated password)
```

## Architecture: modular monolith

One process, one Postgres database, strict module boundaries.

```
src/
  platform/            shared infrastructure only: config, database, http, logging, health,
                       events, i18n, app-context
  modules/<name>/
    index.ts           the ONLY file other modules may import
    <name>.module.ts
    <name>.facade.ts   public interface used by other modules
    <name>.tables.ts   Drizzle tables in pgSchema('<name>')
    <name>.store.ts    queries against the module's own tables (or stores/ when there are several)
    http/              <name>.controller.ts (/v1/...) and <name>-admin.controller.ts (/v1/admin/...)
```

Modules and their direction (arrow = imports `index.ts`):
`users → auth, apps, favorites, reviews, legal, promotions, payments`;
`payments → promotions → tours → media`; `payments → apps → legal, settings`;
`analytics → apps, payments`; `routing` (Valhalla walking routes) depends on no module but `auth`; every module with protected routes imports `auth`.

Rules, enforced by `npm run arch` (dependency-cruiser), ESLint and `test/arch`:

- Import another module only through its `index.ts`. Never import its tables, store or services.
- Each module owns one Postgres schema. No foreign keys across schemas: store the other module's id as a plain `uuid`.
- Dependencies go one way. No cycles, no `forwardRef`. If two modules need each other, move the orchestration to the one that depends on the other, or invert with a port declared lower down (example: `platform/app-context` declares `AppDirectory`, `apps` implements it, `AppModule` binds it).
- `platform/` never imports from `modules/`.
- Events are for optional side effects only; delivery is not guaranteed. Declare them with `defineEvent<Payload>()` in the publishing module and export them from its `index.ts`; subscribe with `@OnDomainEvent(...)`.
- A module holding user data adds an idempotent `deleteUserData(userId)` step to `users/account-deletion.service.ts`.

## Conventions

- Configuration: add every variable to `src/platform/config/env.schema.ts`; never read `process.env` elsewhere. Secrets go into `SECRET_KEYS` so production refuses weak values.
- Transactions: stores take `@InjectDb() private readonly txHost: DbTxHost` and use `txHost.tx`. Wrap multi-step writes in `@Transactional()`; nested facade calls join it automatically.
- Ids: `primaryId()` from `platform/database` (Postgres 18 `uuidv7()`). Money: integer kopecks.
- HTTP: DTOs are zod schemas via `createZodDto`; errors are problem+json — throw `AppError` with a stable `code`. PATCH bodies use `patchSchema()`: zod 4 fills defaults even inside `.partial()`.
- App-specific routes carry `@RequiresApp()` (X-Bundle-Id, 400 when missing or unknown) and read `@CurrentApp()`. Content language comes from `@RequestLocale()`.
- Runtime-tunable client behaviour belongs in `modules/settings/settings.catalog.ts`, never in the app.
- Payments follow `src/modules/payments/ORDER_STATES.md`; change the document first.
- Names: use the conventional domain terms (tours, points, favorites, reviews, promo codes, orders, purchases).

## Deployment

`docker-compose.yml` runs postgres, a one-off `migrate`, the API, nginx (`deploy/nginx`), martin (map
tiles), valhalla (walking routing, `routing` profile) and certbot on one VPS. Secrets are env files in `secrets/` on the server (templates in
`secrets.example/`). CI (`.github/workflows`) checks every push and runs a Docker smoke test; the
Deploy workflow runs only from the `release` branch or by hand. Backups: `scripts/backup-db.sh`
(cron file in `deploy/cron`). Map style and tiles: `deploy/maps`. Routing graph: `deploy/routing`.
