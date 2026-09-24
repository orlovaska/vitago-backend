import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AuthFacade, SYSTEM_ROLES, type SystemRole } from '../modules/auth';
import { loadDotEnvFile } from '../platform/config';

const ROLES = SYSTEM_ROLES.join(', ');

const USAGE = `Usage:
  npm run admin -- create <login> [role]   create an administrator (superadmin by default)
                                           with a generated password
  npm run admin -- reset <login>           replace an administrator's password with a generated
                                           one; their open sessions end
  npm run admin -- role <login> <role>     give an administrator a system role

Roles: ${ROLES}`;

const isSystemRole = (value: string | undefined): value is SystemRole =>
  SYSTEM_ROLES.includes(value as SystemRole);

type Command =
  | { name: 'create'; login: string; role: SystemRole }
  | { name: 'reset'; login: string }
  | { name: 'role'; login: string; role: SystemRole };

function parse([name, login, role]: string[]): Command | null {
  if (!login) return null;
  if (name === 'create' && (role === undefined || isSystemRole(role))) {
    return { name, login, role: role ?? 'superadmin' };
  }
  if (name === 'reset' && role === undefined) return { name, login };
  if (name === 'role' && isSystemRole(role)) return { name, login, role };
  return null;
}

async function run(): Promise<void> {
  const command = parse(process.argv.slice(2));
  if (!command) {
    console.error(USAGE);
    process.exit(2);
  }

  loadDotEnvFile();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const auth = app.get(AuthFacade);
    const { login } = command;
    // Passwords are generated, never taken from argv, to keep them out of shell history.
    if (command.name === 'create') {
      const created = await auth.createAdmin(login, { role: command.role });
      console.log(`Admin "${login}" created with role ${command.role}.`);
      console.log(`Password (shown once): ${created.password}`);
    } else if (command.name === 'reset') {
      const password = await auth.resetAdminPassword(login);
      console.log(`Admin "${login}" updated; their open sessions have ended.`);
      console.log(`Password (shown once): ${password}`);
    } else {
      await auth.setAdminRole(login, command.role);
      console.log(`Admin "${login}" now has role ${command.role}.`);
    }
  } finally {
    await app.close();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
