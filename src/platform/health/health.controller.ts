import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { type Sql } from 'postgres';
import { SQL_CLIENT } from '../database';

/**
 * Probes for Docker and CI. Kept outside /v1 and out of the OpenAPI contract:
 * they describe the process, not the product.
 */
@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(@Inject(SQL_CLIENT) private readonly sql: Sql) {}

  /** The process is up and serving HTTP. */
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** The process can do useful work: the database answers. */
  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    try {
      await this.sql`select 1`;
    } catch {
      throw new ServiceUnavailableException('Database is unreachable');
    }
    return { status: 'ok' };
  }
}
