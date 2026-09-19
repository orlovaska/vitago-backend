import { Body, Controller, Header, HttpCode, Logger, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AppError } from '../../../platform/http';
import { PaymentGateway } from '../gateway/payment-gateway';
import { OrderProcessor } from '../services/order-processor';

/**
 * Receives payment notifications from T-Bank. Not part of the app contract.
 * The bank retries until it gets a 200 with the body "OK", so every
 * signed notification is acknowledged, including repeats and ones we ignore.
 */
@ApiExcludeController()
@Controller('payments/tbank/notifications')
export class TbankNotificationsController {
  private readonly logger = new Logger(TbankNotificationsController.name);

  constructor(
    private readonly gateway: PaymentGateway,
    private readonly processor: OrderProcessor,
  ) {}

  @Post()
  @HttpCode(200)
  @Header('Content-Type', 'text/plain')
  async receive(@Body() body: unknown): Promise<string> {
    // The signature is checked before any field is trusted.
    const report = this.gateway.verifyNotification(body);
    if (!report) {
      this.logger.warn('Rejected a payment notification with an invalid signature');
      throw AppError.forbidden('invalid_signature', 'Invalid notification signature');
    }
    const outcome = await this.processor.applyBankReport(report, 'notification');
    this.logger.log(`Notification ${report.status} for order ${report.orderId}: ${outcome}`);
    return 'OK';
  }
}
