import { Module } from '@nestjs/common';
import { AppsModule } from '../apps';
import { AuthModule } from '../auth';
import { PromotionsModule } from '../promotions';
import { SettingsModule } from '../settings';
import { ToursModule } from '../tours';
import { PaymentGateway } from './gateway/payment-gateway';
import { TbankGateway } from './gateway/tbank.gateway';
import { PaymentsAdminController } from './http/payments-admin.controller';
import { PaymentsController } from './http/payments.controller';
import { TbankNotificationsController } from './http/tbank-notifications.controller';
import { PaymentsFacade } from './payments.facade';
import { CheckoutService } from './services/checkout.service';
import { OrderProcessor } from './services/order-processor';
import { OrderStatusService } from './services/order-status.service';
import { PaymentsAdminService } from './services/payments-admin.service';
import { TourAccessService } from './services/tour-access.service';
import { OrdersStore } from './stores/orders.store';
import { PurchasesStore } from './stores/purchases.store';

/** Selling tours: orders, the bank, and who has access to what. */
@Module({
  imports: [AuthModule, AppsModule, ToursModule, PromotionsModule, SettingsModule],
  controllers: [PaymentsController, TbankNotificationsController, PaymentsAdminController],
  providers: [
    OrdersStore,
    PurchasesStore,
    OrderProcessor,
    CheckoutService,
    OrderStatusService,
    TourAccessService,
    PaymentsAdminService,
    PaymentsFacade,
    { provide: PaymentGateway, useClass: TbankGateway },
  ],
  exports: [PaymentsFacade],
})
export class PaymentsModule {}
