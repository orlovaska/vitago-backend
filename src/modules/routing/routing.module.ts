import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { RoutingAdminController } from './http/routing-admin.controller';
import { RoutingFacade } from './routing.facade';
import { ValhallaClient } from './valhalla.client';

/** Walking routes between points, from the self-hosted Valhalla engine. No tables. */
@Module({
  imports: [AuthModule],
  controllers: [RoutingAdminController],
  providers: [ValhallaClient, RoutingFacade],
  exports: [RoutingFacade],
})
export class RoutingModule {}
