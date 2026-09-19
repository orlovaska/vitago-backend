import { Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { type DbTxHost, InjectDb } from '../../../platform/database';
import { categories, categoryTranslations } from '../tours.tables';

export type CategoryRow = typeof categories.$inferSelect;
export type CategoryFields = Omit<typeof categories.$inferInsert, 'id'>;
export type CategoryTranslationRow = typeof categoryTranslations.$inferSelect;

@Injectable()
export class CategoriesStore {
  constructor(@InjectDb() private readonly txHost: DbTxHost) {}

  private get db() {
    return this.txHost.tx;
  }

  list(): Promise<CategoryRow[]> {
    return this.db
      .select()
      .from(categories)
      .orderBy(asc(categories.position), asc(categories.slug));
  }

  async byIds(ids: readonly string[]): Promise<CategoryRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(categories)
      .where(inArray(categories.id, [...ids]));
  }

  translations(categoryIds: readonly string[]): Promise<CategoryTranslationRow[]> {
    if (categoryIds.length === 0) return Promise.resolve([]);
    return this.db
      .select()
      .from(categoryTranslations)
      .where(inArray(categoryTranslations.categoryId, [...categoryIds]));
  }

  async insert(fields: CategoryFields): Promise<CategoryRow> {
    const [row] = await this.db.insert(categories).values(fields).returning();
    return row!;
  }

  async update(id: string, fields: Partial<CategoryFields>): Promise<CategoryRow | null> {
    const [row] = await this.db
      .update(categories)
      .set(fields)
      .where(eq(categories.id, id))
      .returning();
    return row ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(categories)
      .where(eq(categories.id, id))
      .returning({ id: categories.id });
    return rows.length > 0;
  }

  async replaceTranslations(
    categoryId: string,
    rows: readonly { locale: string; name: string }[],
  ): Promise<void> {
    await this.db
      .delete(categoryTranslations)
      .where(eq(categoryTranslations.categoryId, categoryId));
    if (rows.length > 0) {
      await this.db
        .insert(categoryTranslations)
        .values(rows.map((row) => ({ ...row, categoryId })));
    }
  }
}
