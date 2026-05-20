import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  Body,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, DocumentType } from '../common/enums';
import { DriverDocumentsService, DocumentDto } from './driver-documents.service';

// ── Upload storage ────────────────────────────────────────────────────────────
const DOCS_DIR = join(process.cwd(), 'uploads', 'documents');
if (!existsSync(DOCS_DIR)) mkdirSync(DOCS_DIR, { recursive: true });

const docStorage = diskStorage({
  destination: DOCS_DIR,
  filename: (_req, file, cb) => {
    const ext  = extname(file.originalname).toLowerCase() || '.jpg';
    const name = `doc-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, name);
  },
});

const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/pdf',
];

function docFileFilter(
  _req: any,
  file: Express.Multer.File,
  cb: (err: Error | null, accept: boolean) => void,
) {
  if (ALLOWED_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestException('Only images (JPG/PNG/WEBP/HEIC) and PDF files are accepted'), false);
  }
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

class UploadDocumentDto {
  @IsEnum(DocumentType)
  type: DocumentType;
}

class RejectDocumentDto {
  @IsString() @IsOptional() @MaxLength(500)
  reason?: string;
}

// ── Driver routes: /driver/documents ─────────────────────────────────────────

@Controller('driver/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DRIVER)
export class DriverDocumentsController {
  constructor(private readonly svc: DriverDocumentsService) {}

  /** GET /driver/documents — list own documents with status */
  @Get()
  @HttpCode(HttpStatus.OK)
  getMyDocuments(
    @Request() req: { user: { id: string } },
  ): Promise<DocumentDto[]> {
    return this.svc.getMyDocuments(req.user.id);
  }

  /**
   * POST /driver/documents
   * Multipart form: field "file" (image/PDF) + field "type" (DocumentType enum).
   * Replaces an existing document of the same type (status reset to pending).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: docStorage,
      fileFilter: docFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
    }),
  )
  uploadDocument(
    @Request() req: { user: { id: string } },
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadDocumentDto,
  ): Promise<DocumentDto> {
    if (!file) throw new BadRequestException('No file provided');
    const fileUrl = `/uploads/documents/${file.filename}`;
    return this.svc.uploadDocument(req.user.id, dto.type, fileUrl, file.originalname ?? null);
  }

  /** DELETE /driver/documents/:id — remove a pending or rejected document */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMyDocument(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) docId: string,
  ): Promise<void> {
    return this.svc.deleteMyDocument(req.user.id, docId);
  }
}

// ── Admin routes: /admin/drivers/:driverId/documents ─────────────────────────

@Controller('admin/drivers/:driverId/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class AdminDocumentsController {
  constructor(private readonly svc: DriverDocumentsService) {}

  /** GET /admin/drivers/:driverId/documents */
  @Get()
  @HttpCode(HttpStatus.OK)
  getDriverDocuments(
    @Param('driverId', ParseUUIDPipe) driverId: string,
  ): Promise<DocumentDto[]> {
    return this.svc.getDriverDocuments(driverId);
  }

  /** PATCH /admin/drivers/:driverId/documents/:docId/approve */
  @Post(':docId/approve')
  @HttpCode(HttpStatus.OK)
  approveDocument(
    @Request() req: { user: { id: string } },
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Param('docId',   ParseUUIDPipe) docId: string,
  ): Promise<DocumentDto> {
    return this.svc.approveDocument(req.user.id, driverId, docId);
  }

  /** POST /admin/drivers/:driverId/documents/:docId/reject */
  @Post(':docId/reject')
  @HttpCode(HttpStatus.OK)
  rejectDocument(
    @Request() req: { user: { id: string } },
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Param('docId',   ParseUUIDPipe) docId: string,
    @Body() dto: RejectDocumentDto,
  ): Promise<DocumentDto> {
    return this.svc.rejectDocument(req.user.id, driverId, docId, dto.reason);
  }
}
