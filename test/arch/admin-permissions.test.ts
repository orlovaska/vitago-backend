import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MODULES_DIR = resolve(__dirname, '..', '..', 'src', 'modules');

/** `admin/auth/me` is the one route every role may call. */
const OPEN_TO_EVERY_ROLE: Record<string, number> = { 'auth-admin.controller.ts': 1 };

function adminControllers(): { name: string; source: string }[] {
  return readdirSync(MODULES_DIR).flatMap((moduleName) => {
    const httpDir = join(MODULES_DIR, moduleName, 'http');
    let files: string[];
    try {
      files = readdirSync(httpDir);
    } catch {
      return [];
    }
    return files
      .filter((file) => file.endsWith('-admin.controller.ts'))
      .map((file) => ({ name: file, source: readFileSync(join(httpDir, file), 'utf8') }));
  });
}

describe('admin controllers', () => {
  it.each(adminControllers())(
    '$name names the permission its routes require',
    ({ name, source }) => {
      expect(source, `${name} must use @AdminAuth('<permission>')`).toMatch(/@AdminAuth\('/);
      const openToEveryRole = source.match(/@AdminAuth\(\)/g)?.length ?? 0;
      expect(openToEveryRole, `${name}: @AdminAuth() without a permission lets every role in`).toBe(
        OPEN_TO_EVERY_ROLE[name] ?? 0,
      );
    },
  );
});
