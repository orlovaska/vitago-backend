import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { type AppContext, CurrentApp, RequiresApp } from '../../../platform/app-context';
import { APP_TAG } from '../../../platform/http';
import { CurrentUserId, UserAuth } from '../../auth';
import { LegalService } from '../legal.service';
import {
  AcceptConsentDto,
  ConsentStatusDto,
  CurrentDocumentListDto,
  toConsentStatus,
  toCurrentDocument,
} from './legal.dto';

@ApiTags(APP_TAG)
@RequiresApp()
@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  /** Current terms and privacy policy of the calling app. */
  @Get('documents')
  @ZodResponse({ status: 200, type: CurrentDocumentListDto })
  async documents(@CurrentApp() app: AppContext) {
    return { items: (await this.legal.currentDocuments(app.id)).map(toCurrentDocument) };
  }

  /** Whether the signed-in user has to accept the current documents. */
  @Get('consent')
  @UserAuth()
  @ZodResponse({ status: 200, type: ConsentStatusDto })
  async consent(@CurrentApp() app: AppContext, @CurrentUserId() userId: string) {
    return toConsentStatus(await this.legal.consentStatus(userId, app.id));
  }

  @Post('consent')
  @UserAuth()
  @ZodResponse({ status: 200, type: ConsentStatusDto })
  async accept(
    @CurrentApp() app: AppContext,
    @CurrentUserId() userId: string,
    @Body() body: AcceptConsentDto,
  ) {
    return toConsentStatus(await this.legal.accept(userId, app.id, body.versionIds));
  }
}
