# vitago-backend

API of the Vitago audio guide apps: tours and points with narrated audio, payments, promo codes,
favorites, reviews and the desktop administration.

A NestJS modular monolith on PostgreSQL 18 with Drizzle ORM. See [CLAUDE.md](CLAUDE.md) for the
architecture rules and [ORDER_STATES.md](src/modules/payments/ORDER_STATES.md) for payments.

## Local development

Requirements: Node.js 22.12+, Docker.

```bash
npm install
cp .env.example .env    # point DATABASE_URL at a local Postgres 18
npm run build && npm run db:migrate
npm run admin -- create admin
npm run dev             # http://localhost:3000, docs at /v1/docs
```

## Content

A city's tours, points, audio and photos live in `content/<city>/manifest.json` and are loaded with
`npm run content:import -- content/<city>/manifest.json`. The import converges: repeating it brings
the database to what the file says. [content/README.md](content/README.md) is the brief handed to
whoever writes a tour — what to deliver and in what shape.

## Checks

```bash
npm run check      # typecheck, lint, formatting, module boundaries, unit tests
npm run test:e2e   # end-to-end tests against a throwaway Postgres container
```

## Server

First setup on the VPS (Docker with the compose plugin, rclone for backups):

1. Run the Deploy workflow once (from the `release` branch or by hand) to copy the stack to
   `DEPLOY_PATH` (default `/opt/vitago/api`). GitHub secrets: `DEPLOY_SSH_KEY`, `DEPLOY_HOST`,
   `DEPLOY_USER`, `DEPLOY_PATH`.
2. Fill in `secrets/*.env` there (templates in `secrets.example/`); the API refuses placeholder
   secrets, so it stays down until then. Start with `docker compose up -d`.
3. Issue certificates:
   `docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d api.vitagoguides.ru -d vitagoguides.ru`,
   then `docker compose restart nginx`.
4. Create an administrator: `docker compose exec api node dist/cli/admin.js create <login>`.
5. Backups: configure an rclone remote, fill in `secrets/backup.env`, install
   `deploy/cron/vitago-backup` into `/etc/cron.d/`.
6. Map: see [deploy/maps](deploy/maps/README.md).
