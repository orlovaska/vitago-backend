import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { MediaModule } from '../media';
import { LegalAdminController } from './http/legal-admin.controller';
import { LegalController } from './http/legal.controller';
import { LegalFacade } from './legal.facade';
import { LegalService } from './legal.service';
import { LegalStore } from './legal.store';

/** Terms of use and privacy policies per app, and who accepted which version. */
@Module({
  imports: [AuthModule, MediaModule],
  controllers: [LegalController, LegalAdminController],
  providers: [LegalStore, LegalService, LegalFacade],
  exports: [LegalFacade],
})
export class LegalModule {}
