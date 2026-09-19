import { TransactionalAdapterDrizzleOrm } from '@nestjs-cls/transactional-adapter-drizzle-orm';
import { type Database, DRIZZLE } from './database.tokens';

/**
 * The Drizzle adapter hands `{}` to db.transaction() when no options are
 * given, and Drizzle turns any options object into a `set transaction`
 * statement — an empty one, which Postgres rejects. Passing `undefined` for
 * empty options keeps plain transactions plain (Postgres default: read
 * committed) without forcing options on nested @Transactional() calls.
 */
export class DrizzleTransactionalAdapter extends TransactionalAdapterDrizzleOrm<Database> {
  constructor() {
    super({ drizzleInstanceToken: DRIZZLE });
    const createOptions = this.optionsFactory;
    this.optionsFactory = (db) => {
      const options = createOptions(db);
      return {
        ...options,
        wrapWithTransaction: (txOptions, fn, setClient) =>
          options.wrapWithTransaction(
            txOptions && Object.keys(txOptions).length > 0 ? txOptions : undefined,
            fn,
            setClient,
          ),
      };
    };
  }
}
