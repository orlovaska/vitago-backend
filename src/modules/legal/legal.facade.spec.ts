import { describe, expect, it, vi } from 'vitest';
import { LegalFacade } from './legal.facade';
import { type LegalService } from './legal.service';

const APP = 'app-1';
const DOCUMENT = 'doc-1';

function facade(versions: { fileId: string }[] | null) {
  const listDocuments = vi.fn(() =>
    Promise.resolve(
      versions === null ? [] : [{ document: { id: DOCUMENT, type: 'terms' as const }, versions }],
    ),
  );
  const legal = {
    listDocuments,
    createDocument: vi.fn(() => Promise.resolve({ id: DOCUMENT })),
    updateDocument: vi.fn(() => Promise.resolve({ id: DOCUMENT })),
    publishVersion: vi.fn(() => Promise.resolve({ id: 'version-1' })),
  } as unknown as LegalService;
  return {
    facade: new LegalFacade(legal),
    legal: legal as unknown as Record<string, ReturnType<typeof vi.fn>>,
  };
}

const input = (fileId: string) => ({
  appId: APP,
  type: 'terms' as const,
  publicUrl: 'https://example.test/terms',
  fileId,
  requiresReconsent: true,
});

describe('LegalFacade.publishDocument', () => {
  it('creates a document the app did not have', async () => {
    const { facade: subject, legal } = facade(null);

    const result = await subject.publishDocument(input('file-1'));

    expect(legal.createDocument).toHaveBeenCalled();
    expect(legal.publishVersion).toHaveBeenCalledWith(DOCUMENT, 'file-1', true);
    expect(result).toEqual({ published: true });
  });

  it('publishes a new version when the text changed', async () => {
    const { facade: subject, legal } = facade([{ fileId: 'file-old' }]);

    const result = await subject.publishDocument(input('file-new'));

    expect(legal.updateDocument).toHaveBeenCalledWith(DOCUMENT, 'https://example.test/terms');
    expect(legal.publishVersion).toHaveBeenCalledWith(DOCUMENT, 'file-new', true);
    expect(result).toEqual({ published: true });
  });

  it('does not add a version for the same file, so consent still counts', async () => {
    const { facade: subject, legal } = facade([{ fileId: 'file-1' }, { fileId: 'file-old' }]);

    const result = await subject.publishDocument(input('file-1'));

    expect(legal.publishVersion).not.toHaveBeenCalled();
    // The link is updated anyway: it can change without the text changing.
    expect(legal.updateDocument).toHaveBeenCalledWith(DOCUMENT, 'https://example.test/terms');
    expect(result).toEqual({ published: false });
  });
});
