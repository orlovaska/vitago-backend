import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ADMIN_TAG, IdParamDto } from '../../../platform/http';
import { AdminAuth } from '../../auth';
import { LegalService } from '../legal.service';
import {
  AdminDocumentDto,
  AdminDocumentListDto,
  AdminDocumentVersionDto,
  CreateDocumentDto,
  ListDocumentsQueryDto,
  PublishVersionDto,
  toAdminDocument,
  toAdminVersion,
  UpdateDocumentDto,
} from './legal.dto';

@ApiTags(ADMIN_TAG)
@AdminAuth('content')
@Controller('admin/legal/documents')
export class LegalAdminController {
  constructor(private readonly legal: LegalService) {}

  @Get()
  @ZodResponse({ status: 200, type: AdminDocumentListDto })
  async list(@Query() { appId }: ListDocumentsQueryDto) {
    return { items: (await this.legal.listDocuments(appId)).map(toAdminDocument) };
  }

  @Post()
  @ZodResponse({ status: 201, type: AdminDocumentDto })
  async create(@Body() body: CreateDocumentDto) {
    const document = await this.legal.createDocument(body.appId, body.type, body.publicUrl);
    return toAdminDocument({ document, versions: [] });
  }

  @Patch(':id')
  @HttpCode(204)
  async update(@Param() { id }: IdParamDto, @Body() body: UpdateDocumentDto): Promise<void> {
    await this.legal.updateDocument(id, body.publicUrl);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param() { id }: IdParamDto): Promise<void> {
    await this.legal.deleteDocument(id);
  }

  /** Publishes a new text; it becomes current immediately. */
  @Post(':id/versions')
  @ZodResponse({ status: 201, type: AdminDocumentVersionDto })
  async publish(@Param() { id }: IdParamDto, @Body() body: PublishVersionDto) {
    return toAdminVersion(await this.legal.publishVersion(id, body.fileId, body.requiresReconsent));
  }
}
