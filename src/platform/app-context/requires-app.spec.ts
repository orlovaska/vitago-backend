import { type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { type AppContext, AppDirectory } from './app-directory';
import { RequiresAppGuard } from './requires-app';

const spb: AppContext = { id: 'app-1', slug: 'spb', bundleId: 'ru.vitago.spb' };

class FakeDirectory extends AppDirectory {
  findByBundleId(bundleId: string) {
    return Promise.resolve(bundleId === spb.bundleId ? spb : null);
  }
  findById() {
    return Promise.resolve(null);
  }
}

function contextFor(headers: Record<string, string>) {
  const request = {
    header: (name: string) => headers[name.toLowerCase()],
  } as { header(name: string): string | undefined; appContext?: AppContext };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { request, context };
}

describe('RequiresAppGuard', () => {
  const guard = new RequiresAppGuard(new FakeDirectory());

  it('attaches the app named by the header', async () => {
    const { request, context } = contextFor({ 'x-bundle-id': 'ru.vitago.spb' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.appContext).toEqual(spb);
  });

  it('rejects a missing header with app_required', async () => {
    const { context } = contextFor({});
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'app_required' });
  });

  it('rejects an unknown bundle with unknown_app', async () => {
    const { context } = contextFor({ 'x-bundle-id': 'com.example.other' });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'unknown_app' });
  });
});
