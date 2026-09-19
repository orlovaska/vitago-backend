import { copyFile, mkdir, rename, rm } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../platform/config';
import { FileStorage } from './file-storage';

@Injectable()
export class LocalDiskStorage extends FileStorage {
  private readonly root: string;

  constructor(config: AppConfig) {
    super();
    this.root = resolve(config.env.MEDIA_DIR);
  }

  async save(key: string, sourcePath: string): Promise<void> {
    const target = this.localPath(key);
    await mkdir(dirname(target), { recursive: true });
    try {
      await rename(sourcePath, target);
    } catch (error) {
      // Temporary uploads may sit on another volume, where rename is impossible.
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      await copyFile(sourcePath, target);
      await rm(sourcePath, { force: true });
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.localPath(key), { force: true });
  }

  localPath(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) {
      throw new Error(`Storage key escapes the media root: ${key}`);
    }
    return path;
  }
}
