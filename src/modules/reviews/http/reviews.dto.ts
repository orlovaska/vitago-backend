import { z } from 'zod';
import { pageQuery, createZodDto } from '../../../platform/http';
import { type ReviewRow } from '../reviews.store';
import { reviewStatus } from '../reviews.tables';

const publicReviewSchema = z.object({
  id: z.uuid(),
  rating: z.number().int(),
  text: z.string().nullable(),
  authorName: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});

const ratingSchema = z.object({
  tourId: z.uuid(),
  /** Average of approved reviews, one decimal; 0 when there are none. */
  average: z.number(),
  count: z.number().int(),
});

export class TourReviewsDto extends createZodDto(
  z.object({
    rating: ratingSchema,
    items: z.array(publicReviewSchema),
    nextCursor: z.string().nullable(),
  }),
) {}

export class RatingListDto extends createZodDto(z.object({ items: z.array(ratingSchema) })) {}

const ownReviewSchema = publicReviewSchema.extend({
  status: z.enum(reviewStatus.enumValues),
});

export class OwnReviewDto extends createZodDto(z.object({ review: ownReviewSchema.nullable() })) {}

export class SaveReviewDto extends createZodDto(
  z.object({
    rating: z.number().int().min(1).max(5),
    text: z.string().trim().max(3000).nullable().default(null),
    authorName: z.string().trim().max(60).nullable().default(null),
  }),
) {}

export class TourIdParamDto extends createZodDto(z.object({ tourId: z.uuid() })) {}
export class PageQueryDto extends createZodDto(z.object(pageQuery)) {}

export class ModerationQueryDto extends createZodDto(
  z.object({ ...pageQuery, status: z.enum(reviewStatus.enumValues).optional() }),
) {}

const moderationReviewSchema = ownReviewSchema.extend({
  tourId: z.uuid(),
  userId: z.uuid(),
  createdAt: z.iso.datetime(),
  moderatedAt: z.iso.datetime().nullable(),
});

export class ModerationPageDto extends createZodDto(
  z.object({ items: z.array(moderationReviewSchema), nextCursor: z.string().nullable() }),
) {}

export class ModerationReviewDto extends createZodDto(moderationReviewSchema) {}

export const toPublicReview = (review: ReviewRow) => ({
  id: review.id,
  rating: review.rating,
  text: review.text,
  authorName: review.authorName,
  updatedAt: review.updatedAt.toISOString(),
});

export const toOwnReview = (review: ReviewRow) => ({
  ...toPublicReview(review),
  status: review.status,
});

export const toModerationReview = (review: ReviewRow) => ({
  ...toOwnReview(review),
  tourId: review.tourId,
  userId: review.userId,
  createdAt: review.createdAt.toISOString(),
  moderatedAt: review.moderatedAt?.toISOString() ?? null,
});
