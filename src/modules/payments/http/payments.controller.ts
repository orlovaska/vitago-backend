import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { type AppContext, CurrentApp, RequiresApp } from '../../../platform/app-context';
import { APP_TAG, IdParamDto } from '../../../platform/http';
import { CurrentUserId, UserAuth } from '../../auth';
import { CheckoutService } from '../services/checkout.service';
import { OrderStatusService } from '../services/order-status.service';
import { TourAccessService } from '../services/tour-access.service';
import {
  CheckoutDto,
  CheckoutRequestDto,
  clientStatus,
  OrderStatusDto,
  PurchaseListDto,
  TourAccessDto,
  TourIdParamDto,
} from './payments.dto';

@ApiTags(APP_TAG)
@RequiresApp()
@UserAuth()
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly statuses: OrderStatusService,
    private readonly access: TourAccessService,
  ) {}

  /**
   * Starts buying a tour. Open `paymentUrl` in the browser, then poll the
   * order: the purchase is credited only when the bank confirms it.
   */
  @Post('orders')
  @ZodResponse({ status: 201, type: CheckoutDto })
  async createOrder(
    @CurrentUserId() userId: string,
    @CurrentApp() app: AppContext,
    @Body() body: CheckoutRequestDto,
  ) {
    const { order, pollIntervalMs, pollWindowMs } = await this.checkout.checkout({
      userId,
      app,
      ...body,
    });
    return {
      orderId: order.id,
      status: clientStatus(order.status),
      paymentUrl: order.status === 'awaiting_payment' ? order.paymentUrl : null,
      amountKopecks: order.amountKopecks,
      pollIntervalMs,
      pollWindowMs,
    };
  }

  /** Current status of the user's order; ask again after `retryAfterMs` while pending. */
  @Get('orders/:id')
  @ZodResponse({ status: 200, type: OrderStatusDto })
  async orderStatus(@CurrentUserId() userId: string, @Param() { id }: IdParamDto) {
    const { order, retryAfterMs } = await this.statuses.status(userId, id);
    return { orderId: order.id, status: clientStatus(order.status), retryAfterMs };
  }

  /** Whether the user may play the tour, its price and the code to share after buying. */
  @Get('tours/:tourId/access')
  @ZodResponse({ status: 200, type: TourAccessDto })
  tourAccess(
    @CurrentUserId() userId: string,
    @CurrentApp() app: AppContext,
    @Param() { tourId }: TourIdParamDto,
  ) {
    return this.access.forTour(userId, app.id, tourId);
  }

  /** Tours of this app the user has bought. */
  @Get('purchases')
  @ZodResponse({ status: 200, type: PurchaseListDto })
  async purchases(@CurrentUserId() userId: string, @CurrentApp() app: AppContext) {
    const purchases = await this.access.forApp(userId, app.id);
    return {
      items: purchases.map((purchase) => ({
        tourId: purchase.tourId,
        grantedAt: purchase.grantedAt.toISOString(),
      })),
    };
  }
}
