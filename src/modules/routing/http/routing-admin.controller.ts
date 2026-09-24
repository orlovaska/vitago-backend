import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { AppConfig } from '../../../platform/config';
import { ADMIN_TAG } from '../../../platform/http';
import { AdminAuth } from '../../auth';
import { ValhallaClient } from '../valhalla.client';
import { RouteRequestDto, RoutingStatusDto, WalkingRouteDto } from './routing.dto';

/**
 * Checks of the routing engine. The backend itself builds routes through
 * RoutingFacade; these endpoints only let an administrator try it.
 */
@ApiTags(ADMIN_TAG)
@AdminAuth('content')
@Controller('admin/routing')
export class RoutingAdminController {
  constructor(
    private readonly valhalla: ValhallaClient,
    private readonly config: AppConfig,
  ) {}

  /** Walking route from A to B: distance, duration and the line along the streets. */
  @Post('route')
  @ZodResponse({ status: 200, type: WalkingRouteDto })
  route(@Body() body: RouteRequestDto) {
    return this.valhalla.walkingRoute(body.from, body.to);
  }

  /** Whether Valhalla answers, its version and the configured areas. 503 when it is down. */
  @Get('status')
  @ZodResponse({ status: 200, type: RoutingStatusDto })
  async status() {
    return {
      ...(await this.valhalla.status()),
      regions: Object.keys(this.config.env.ROUTING_REGIONS),
    };
  }
}
