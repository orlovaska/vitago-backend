import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppConfig } from '../../platform/config';
import { AppError } from '../../platform/http';
import { LOG_FILE_PREFIX } from '../../platform/logging';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Pino's numeric levels. */
const LEVEL_NUMBER: Record<LogLevel, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

/** Only files the logger itself writes can be read, never an arbitrary path. */
const FILE_NAME = new RegExp(`^${LOG_FILE_PREFIX}\\.[\\w.-]+\\.log$`);

export interface LogFile {
  name: string;
  sizeBytes: number;
  modifiedAt: Date;
}

export interface LogEntryQuery {
  file: string;
  /** Entries at this level or more severe. */
  minLevel: LogLevel;
  /** Case-insensitive substring of the raw line. */
  search?: string;
  limit: number;
}

/**
 * Reads the rotated log files written by pino-roll (see platform/logging).
 * The file currently being written is only appended to, so reading it is safe.
 */
@Injectable()
export class LogsService {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: PinoLogger,
  ) {}

  private get directory(): string {
    const dir = this.config.env.LOG_DIR;
    if (!dir) throw AppError.notFound('logs_disabled', 'File logging is off (LOG_DIR is not set)');
    return resolve(dir);
  }

  async files(): Promise<LogFile[]> {
    const names = (await readdir(this.directory)).filter((name) => FILE_NAME.test(name));
    const files = await Promise.all(
      names.map(async (name) => {
        const info = await stat(join(this.directory, name));
        return { name, sizeBytes: info.size, modifiedAt: info.mtime };
      }),
    );
    return files.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  }

  pathOf(name: string): string {
    if (!FILE_NAME.test(name)) {
      throw AppError.badRequest('invalid_log_file', `Not a log file name: ${name}`);
    }
    return join(this.directory, name);
  }

  /** The newest `limit` entries of a file that match the filters, newest first. */
  async entries(query: LogEntryQuery): Promise<Record<string, unknown>[]> {
    const path = this.pathOf(query.file);
    await stat(path).catch(() => {
      throw AppError.notFound('log_file_not_found', `No log file ${query.file}`);
    });
    const threshold = LEVEL_NUMBER[query.minLevel];
    const needle = query.search?.toLowerCase();
    const newest: Record<string, unknown>[] = [];

    const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    for await (const line of lines) {
      if (needle && !line.toLowerCase().includes(needle)) continue;
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (typeof entry.level !== 'number' || entry.level < threshold) continue;
      newest.push(entry);
      if (newest.length > query.limit) newest.shift();
    }
    return newest.reverse();
  }

  level(): LogLevel {
    return this.logger.logger.level as LogLevel;
  }

  /** Changes the level of the running process until the next restart. */
  setLevel(level: LogLevel): void {
    PinoLogger.root.level = level;
  }
}
