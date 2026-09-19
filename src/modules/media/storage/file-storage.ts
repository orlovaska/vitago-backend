/**
 * Where file bytes live. Only a local disk backend exists; an object store
 * such as S3 would be another implementation bound in MediaModule.
 */
export abstract class FileStorage {
  /** Moves a finished temporary file into storage under `key`. */
  abstract save(key: string, sourcePath: string): Promise<void>;

  /** Removes the file; a missing file is not an error. */
  abstract remove(key: string): Promise<void>;

  /** Absolute path the HTTP layer streams from (with Range and ETag support). */
  abstract localPath(key: string): string;
}
