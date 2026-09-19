import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AuthFacade } from '../modules/auth';
import { loadDotEnvFile } from '../platform/config';

const USAGE = `Usage:
  npm run admin -- create <login>     create an administrator with a generated password
  npm run admin -- reset <login>      replace an administrator's password with a generated one`;

/** Printed once and never stored in plain text; the password is not taken from argv to keep it out of shell history. */
const generatePassword = () => randomBytes(18).toString('base64url');

async function run(): Promise<void> {
  const [command, login] = process.argv.slice(2);
  if (!login || (command !== 'create' && command !== 'reset')) {
    console.error(USAGE);
    process.exit(2);
  }

  loadDotEnvFile();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const auth = app.get(AuthFacade);
    const password = generatePassword();
    if (command === 'create') {
      await auth.createAdmin(login, password);
    } else {
      await auth.setAdminPassword(login, password);
    }
    console.log(`Admin "${login}" ${command === 'create' ? 'created' : 'updated'}.`);
    console.log(`Password (shown once): ${password}`);
  } finally {
    await app.close();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
