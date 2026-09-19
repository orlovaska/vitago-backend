import { Transactional } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { isUniqueViolation } from '../../../platform/database';
import { AppError } from '../../../platform/http';
import { type Locale, pickTranslation } from '../../../platform/i18n';
import { FileReferences } from '../file-references';
import {
  type CategoryRow,
  CategoriesStore,
  type CategoryTranslationRow,
} from '../stores/categories.store';
import { type CategoryInput } from '../tours.inputs';

export interface CategoryWithTranslations {
  category: CategoryRow;
  translations: CategoryTranslationRow[];
}

export interface LocalizedCategory {
  id: string;
  slug: string;
  name: string;
  iconImageId: string | null;
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly store: CategoriesStore,
    private readonly files: FileReferences,
  ) {}

  async listWithTranslations(): Promise<CategoryWithTranslations[]> {
    const categories = await this.store.list();
    const translations = await this.store.translations(categories.map((category) => category.id));
    return categories.map((category) => ({
      category,
      translations: translations.filter((translation) => translation.categoryId === category.id),
    }));
  }

  async localized(locale: Locale, ids?: readonly string[]): Promise<LocalizedCategory[]> {
    const all = await this.listWithTranslations();
    return all
      .filter(({ category }) => !ids || ids.includes(category.id))
      .map(({ category, translations }) => ({
        id: category.id,
        slug: category.slug,
        name: pickTranslation(translations, locale)?.name ?? category.slug,
        iconImageId: category.iconImageId,
      }));
  }

  @Transactional()
  async create(input: CategoryInput): Promise<CategoryRow> {
    await this.files.assertExist([input.iconImageId]);
    const category = await this.withUniqueSlug(input.slug, () =>
      this.store.insert({
        slug: input.slug,
        position: input.position,
        iconImageId: input.iconImageId,
      }),
    );
    await this.store.replaceTranslations(category.id, input.translations);
    return category;
  }

  @Transactional()
  async replace(id: string, input: CategoryInput): Promise<CategoryRow> {
    await this.files.assertExist([input.iconImageId]);
    const category = await this.withUniqueSlug(input.slug, () =>
      this.store.update(id, {
        slug: input.slug,
        position: input.position,
        iconImageId: input.iconImageId,
      }),
    );
    if (!category) throw AppError.notFound('category_not_found', `Category ${id} not found`);
    await this.store.replaceTranslations(id, input.translations);
    return category;
  }

  /** Points simply lose this category. */
  async remove(id: string): Promise<void> {
    if (!(await this.store.delete(id))) {
      throw AppError.notFound('category_not_found', `Category ${id} not found`);
    }
  }

  private async withUniqueSlug<T>(slug: string, write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict('slug_taken', `A category "${slug}" already exists`);
      }
      throw error;
    }
  }
}
