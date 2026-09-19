import { Inject } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { type TransactionalAdapterDrizzleOrm } from '@nestjs-cls/transactional-adapter-drizzle-orm';
import { type PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/** Injection token of the raw postgres.js client (closed on shutdown). */
export const SQL_CLIENT = Symbol('SQL_CLIENT');
/** Injection token of the Drizzle instance. Modules use {@link DbTxHost} instead. */
export const DRIZZLE = Symbol('DRIZZLE');

export type Database = PostgresJsDatabase;

/**
 * What every module store injects: `txHost.tx` is the current transaction
 * when called inside `@Transactional()`, otherwise the plain connection pool.
 */
export type DbTxHost = TransactionHost<TransactionalAdapterDrizzleOrm<Database>>;

/** `constructor(@InjectDb() private readonly txHost: DbTxHost)` — a type alias alone is not a DI token. */
export const InjectDb = (): ParameterDecorator => Inject(TransactionHost);
