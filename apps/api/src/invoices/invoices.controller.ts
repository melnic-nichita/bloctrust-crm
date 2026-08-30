import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diskStorage } from 'multer';
import { MembershipRole } from '../generated/prisma/client.js';
import type { AuthenticatedRequest } from '../identity/authenticated-request.js';
import { Roles } from '../identity/roles.decorator.js';
import { OrganizationScopeGuard } from '../organizations/organization-scope.guard.js';
import { MAX_INVOICE_BYTES } from './document-validation.js';
import { UpdateInvoiceDraftDto, UploadInvoiceDto } from './dto.js';
import { InvoicesService } from './invoices.service.js';

const uploadDirectory = join(tmpdir(), 'bloctrust-invoice-uploads');
mkdirSync(uploadDirectory, { recursive: true, mode: 0o700 });

@Controller('organizations/:organizationId/invoices')
@UseGuards(OrganizationScopeGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @Roles(
    MembershipRole.OWNER,
    MembershipRole.ADMINISTRATOR,
    MembershipRole.ACCOUNTANT,
    MembershipRole.AUDITOR,
  )
  list(@Req() request: AuthenticatedRequest) {
    return this.invoices.list(request.auth);
  }

  @Get(':invoiceId')
  @Roles(
    MembershipRole.OWNER,
    MembershipRole.ADMINISTRATOR,
    MembershipRole.ACCOUNTANT,
    MembershipRole.AUDITOR,
  )
  get(@Req() request: AuthenticatedRequest, @Param('invoiceId') invoiceId: string) {
    return this.invoices.get(request.auth, invoiceId);
  }

  @Post('uploads')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMINISTRATOR, MembershipRole.ACCOUNTANT)
  @UseInterceptors(
    FileInterceptor('document', {
      storage: diskStorage({
        destination: uploadDirectory,
        filename: (_request, _file, callback) => callback(null, randomUUID()),
      }),
      limits: { files: 1, fileSize: MAX_INVOICE_BYTES, fields: 4, parts: 5 },
    }),
  )
  upload(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UploadInvoiceDto,
    @UploadedFile() file: { path: string; originalname: string; mimetype: string; size: number },
  ) {
    return this.invoices.upload(request.auth, dto, file);
  }

  @Patch(':invoiceId/draft')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMINISTRATOR, MembershipRole.ACCOUNTANT)
  update(
    @Req() request: AuthenticatedRequest,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: UpdateInvoiceDraftDto,
  ) {
    return this.invoices.update(request.auth, invoiceId, dto);
  }

  @Post('documents/:documentId/download-authorizations')
  @Header('Cache-Control', 'no-store')
  @Roles(
    MembershipRole.OWNER,
    MembershipRole.ADMINISTRATOR,
    MembershipRole.ACCOUNTANT,
    MembershipRole.AUDITOR,
  )
  issueDownload(@Req() request: AuthenticatedRequest, @Param('documentId') documentId: string) {
    return this.invoices.issueDownload(request.auth, documentId);
  }

  @Get('documents/:documentId/content')
  @Header('Cache-Control', 'private, no-store')
  @Roles(
    MembershipRole.OWNER,
    MembershipRole.ADMINISTRATOR,
    MembershipRole.ACCOUNTANT,
    MembershipRole.AUDITOR,
  )
  async download(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
    @Param('documentId') documentId: string,
    @Query('token') token: string | undefined,
  ): Promise<void> {
    const download = await this.invoices.download(request.auth, documentId, token);
    response.setHeader('Content-Type', download.mimeType);
    response.removeHeader('X-Frame-Options');
    response.removeHeader('Cross-Origin-Resource-Policy');
    response.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; frame-ancestors ${trustedFrameAncestors()}`,
    );
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${safeFilename(download.filename)}"`,
    );
    download.stream.once('error', () => response.destroy());
    download.stream.pipe(response);
  }
}

function safeFilename(filename: string): string {
  return filename.replace(/["\\\r\n]/gu, '_');
}

function trustedFrameAncestors(): string {
  const origins = (process.env.TRUSTED_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => /^https?:\/\/[a-z0-9.-]+(?::\d+)?$/iu.test(origin));
  return origins.length > 0 ? origins.join(' ') : "'none'";
}
