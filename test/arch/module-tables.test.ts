import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

const MODULES_DIR = resolve(__dirname, '..', '..', 'src', 'modules');

/** Postgres schema a module owns: the module folder name with dashes as underscores. */
const schemaOf = (moduleName: string) => moduleName.replaceAll('-', '_');

function listTableFiles(): { moduleName: string; file: string }[] {
  let modules: string[];
  try {
    modules = readdirSync(MODULES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
  return modules.flatMap((moduleName) =>
    readdirSync(join(MODULES_DIR, moduleName))
      .filter((file) => file.endsWith('.tables.ts'))
      .map((file) => ({ moduleName, file: join(MODULES_DIR, moduleName, file) })),
  );
}

describe('module tables', () => {
  const files = listTableFiles();

  if (files.length === 0) {
    it.skip('no module declares tables yet', () => undefined);
    return;
  }

  it.each(files)(
    '$moduleName keeps its tables and foreign keys inside its own schema',
    async ({ moduleName, file }) => {
      const exported = (await import(file)) as Record<string, unknown>;
      const tables = Object.values(exported).filter((value) => is(value, PgTable));
      const expectedSchema = schemaOf(moduleName);

      for (const table of tables) {
        const config = getTableConfig(table);
        expect(config.schema, `${config.name} must live in schema "${expectedSchema}"`).toBe(
          expectedSchema,
        );
        for (const foreignKey of config.foreignKeys) {
          const target = getTableConfig(foreignKey.reference().foreignTable);
          expect(
            target.schema,
            `${config.name} references ${target.schema}.${target.name}; store the id without a foreign key instead`,
          ).toBe(expectedSchema);
        }
      }
    },
    // The first import of a module compiles its whole dependency graph.
    30_000,
  );
});
