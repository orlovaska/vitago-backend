import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ADMIN_TAG, decodeCursor, encodeCursor, IdParamDto } from '../../../platform/http';
import { AdminAuth } from '../../auth';
import { PaymentsAdminService } from '../services/payments-admin.service';
import {
  AdminOrderDto,
  AdminOrderPageDto,
  AdminOrdersQueryDto,
  AdminPurchaseDto,
  AdminPurchaseListDto,
  GrantPurchaseDto,
  toAdminEvent,
  toAdminOrder,
  toAdminPurchase,
} from './payments.dto';

@ApiTags(ADMIN_TAG)
@AdminAuth('payments')
@Controller('admin')
export class PaymentsAdminController {
  constructor(private readonly payments: PaymentsAdminService) {}

  @Get('orders')
  @ZodResponse({ status: 200, type: AdminOrderPageDto })
  async orders(@Query() query: AdminOrdersQueryDto) {
    const { limit, cursor, ...filter } = query;
    const page = await this.payments.page(filter, limit, decodeCursor(cursor));
    return {
      items: page.items.map(toAdminOrder),
      nextCursor: page.next && encodeCursor(page.next),
    };
  }

  /** The order with its full history: transitions and every bank status. */
  @Get('orders/:id')
  @ZodResponse({ status: 200, type: AdminOrderDto })
  async order(@Param() { id }: IdParamDto) {
    const { order, events } = await this.payments.order(id);
    return { order: toAdminOrder(order), events: events.map(toAdminEvent) };
  }

  @Get('users/:id/purchases')
  @ZodResponse({ status: 200, type: AdminPurchaseListDto })
  async purchases(@Param() { id }: IdParamDto) {
    return { items: (await this.payments.purchasesOf(id)).map(toAdminPurchase) };
  }

  /** Gives a user a tour without payment, e.g. as compensation. */
  @Post('purchases')
  @ZodResponse({ status: 201, type: AdminPurchaseDto })
  async grant(@Body() body: GrantPurchaseDto) {
    return toAdminPurchase(await this.payments.grant(body.userId, body.tourId));
  }

  @Delete('purchases/:id')
  @HttpCode(204)
  async revoke(@Param() { id }: IdParamDto): Promise<void> {
    await this.payments.revoke(id);
  }
}
