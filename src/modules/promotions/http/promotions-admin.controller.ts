import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ADMIN_TAG, IdParamDto } from '../../../platform/http';
import { AdminAuth } from '../../auth';
import { PromotionsService } from '../promotions.service';
import {
  CreatePromoCodeDto,
  ListPromoCodesQueryDto,
  PromoCodeDto,
  PromoCodeListDto,
  toPromoCode,
  UpdatePromoCodeDto,
  withDate,
} from './promotions.dto';

@ApiTags(ADMIN_TAG)
@AdminAuth('promotions')
@Controller('admin/promo-codes')
export class PromotionsAdminController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  @ZodResponse({ status: 200, type: PromoCodeListDto })
  async list(@Query() { tourId }: ListPromoCodesQueryDto) {
    return { items: (await this.promotions.list(tourId)).map(toPromoCode) };
  }

  @Post()
  @ZodResponse({ status: 201, type: PromoCodeDto })
  async create(@Body() body: CreatePromoCodeDto) {
    const { expiresAt, ...fields } = withDate(body);
    return toPromoCode(await this.promotions.create({ ...fields, expiresAt: expiresAt ?? null }));
  }

  @Patch(':id')
  @ZodResponse({ status: 200, type: PromoCodeDto })
  async update(@Param() { id }: IdParamDto, @Body() body: UpdatePromoCodeDto) {
    return toPromoCode(await this.promotions.update(id, withDate(body)));
  }

  /** Issues a new invitation link; links sent earlier stop working. */
  @Post(':id/rotate-link')
  @ZodResponse({ status: 200, type: PromoCodeDto })
  async rotateLink(@Param() { id }: IdParamDto) {
    return toPromoCode(await this.promotions.rotateLink(id));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param() { id }: IdParamDto): Promise<void> {
    await this.promotions.remove(id);
  }
}
