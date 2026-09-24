import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ADMIN_TAG, IdParamDto } from '../../../platform/http';
import { AdminAuth, AdminPermissions } from '../../auth';
import { CategoriesService } from '../services/categories.service';
import { PointsAdminService } from '../services/points-admin.service';
import {
  type PointEditorView,
  TourEditorViews,
  type TourEditorView,
} from '../services/tour-editor-views';
import { ToursAdminService } from '../services/tours-admin.service';
import {
  AdminCategoryDto,
  AdminCategoryListDto,
  AdminTourListDto,
  CategoryInputDto,
  ListToursQueryDto,
  PointAudioInputDto,
  PointEditorDto,
  PointInputDto,
  ReorderPointsDto,
  TourEditorDto,
  TourInputDto,
} from './tours.dto';

const toTourEditor = (view: TourEditorView) => ({
  ...view,
  publishedAt: view.publishedAt?.toISOString() ?? null,
  createdAt: view.createdAt.toISOString(),
  updatedAt: view.updatedAt.toISOString(),
});

const toPointEditor = (view: PointEditorView) => view;

@ApiTags(ADMIN_TAG)
@AdminAuth('content')
@Controller('admin')
export class ToursAdminController {
  constructor(
    private readonly tours: ToursAdminService,
    private readonly points: PointsAdminService,
    private readonly categories: CategoriesService,
    private readonly views: TourEditorViews,
  ) {}

  // ---- Tours ----

  @Get('tours')
  @AdminPermissions('content', 'promotions')
  @ZodResponse({ status: 200, type: AdminTourListDto })
  async listTours(@Query() { appId }: ListToursQueryDto) {
    const tours = await this.views.list(appId);
    return {
      items: tours.map((tour) => ({
        id: tour.id,
        slug: tour.slug,
        status: tour.status,
        position: tour.position,
        priceKopecks: tour.priceKopecks,
        updatedAt: tour.updatedAt.toISOString(),
      })),
    };
  }

  @Post('tours')
  @ZodResponse({ status: 201, type: TourEditorDto })
  async createTour(@Body() body: TourInputDto) {
    const tour = await this.tours.create(body);
    return toTourEditor(await this.views.tour(tour.id));
  }

  @Get('tours/:id')
  @AdminPermissions('content', 'promotions')
  @ZodResponse({ status: 200, type: TourEditorDto })
  async getTour(@Param() { id }: IdParamDto) {
    return toTourEditor(await this.views.tour(id));
  }

  /** Replaces the tour's fields, translations and photos; points stay as they are. */
  @Put('tours/:id')
  @ZodResponse({ status: 200, type: TourEditorDto })
  async replaceTour(@Param() { id }: IdParamDto, @Body() body: TourInputDto) {
    await this.tours.replace(id, body);
    return toTourEditor(await this.views.tour(id));
  }

  @Delete('tours/:id')
  @HttpCode(204)
  async removeTour(@Param() { id }: IdParamDto): Promise<void> {
    await this.tours.remove(id);
  }

  // ---- Points ----

  /** Adds a point at the end of the route. */
  @Post('tours/:id/points')
  @ZodResponse({ status: 201, type: PointEditorDto })
  async createPoint(@Param() { id }: IdParamDto, @Body() body: PointInputDto) {
    const point = await this.points.create(id, body);
    return toPointEditor(await this.views.point(point.id));
  }

  /** Sets the route order; list every point of the tour exactly once. */
  @Put('tours/:id/points/order')
  @HttpCode(204)
  async reorderPoints(@Param() { id }: IdParamDto, @Body() body: ReorderPointsDto): Promise<void> {
    await this.points.reorder(id, body.pointIds);
  }

  @Get('points/:id')
  @ZodResponse({ status: 200, type: PointEditorDto })
  async getPoint(@Param() { id }: IdParamDto) {
    return toPointEditor(await this.views.point(id));
  }

  @Put('points/:id')
  @ZodResponse({ status: 200, type: PointEditorDto })
  async replacePoint(@Param() { id }: IdParamDto, @Body() body: PointInputDto) {
    await this.points.replace(id, body);
    return toPointEditor(await this.views.point(id));
  }

  @Delete('points/:id')
  @HttpCode(204)
  async removePoint(@Param() { id }: IdParamDto): Promise<void> {
    await this.points.remove(id);
  }

  /** Adds or replaces the narration, making it an audio point. */
  @Put('points/:id/audio')
  @ZodResponse({ status: 200, type: PointEditorDto })
  async putAudio(@Param() { id }: IdParamDto, @Body() body: PointAudioInputDto) {
    await this.points.putAudio(id, body);
    return toPointEditor(await this.views.point(id));
  }

  /** Removes the narration; the point stays on the route. */
  @Delete('points/:id/audio')
  @HttpCode(204)
  async removeAudio(@Param() { id }: IdParamDto): Promise<void> {
    await this.points.removeAudio(id);
  }

  // ---- Categories ----

  @Get('categories')
  @ZodResponse({ status: 200, type: AdminCategoryListDto })
  async listCategories() {
    const categories = await this.categories.listWithTranslations();
    return {
      items: categories.map(({ category, translations }) => ({
        ...category,
        translations: translations.map(({ locale, name }) => ({
          locale: locale as 'ru' | 'en',
          name,
        })),
      })),
    };
  }

  @Post('categories')
  @ZodResponse({ status: 201, type: AdminCategoryDto })
  async createCategory(@Body() body: CategoryInputDto) {
    const category = await this.categories.create(body);
    return { ...body, id: category.id };
  }

  @Put('categories/:id')
  @ZodResponse({ status: 200, type: AdminCategoryDto })
  async replaceCategory(@Param() { id }: IdParamDto, @Body() body: CategoryInputDto) {
    await this.categories.replace(id, body);
    return { ...body, id };
  }

  @Delete('categories/:id')
  @HttpCode(204)
  async removeCategory(@Param() { id }: IdParamDto): Promise<void> {
    await this.categories.remove(id);
  }
}
