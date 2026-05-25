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
  InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, DocumentType } from '../common/enums';
import { DriverDocumentsService, DocumentDto } from './driver-documents.service';

// ── Cloudinary config (reads env vars at runtime) ─────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
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

/** Upload a buffer to Cloudinary and return the secure URL. */
async function uploadToCloudinary(
  buffer: Buffer,
  folder: string,
  resourceType: 'image' | 'raw' = 'image',
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'));
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
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
   * File is uploaded to Cloudinary; the secure URL is stored in the database.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: docFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
    }),
  )
  async uploadDocument(
    @Request() req: { user: { id: string } },
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadDocumentDto,
  ): Promise<DocumentDto> {
    if (!file) throw new BadRequestException('No file provided');

    // Determine Cloudinary resource type: PDFs are 'raw', images are 'image'
    const resourceType = file.mimetype === 'application/pdf' ? 'raw' : 'image';

    let fileUrl: string;
    try {
      fileUrl = await uploadToCloudinary(file.buffer, 'driver-documents', resourceType);
    } catch {
      throw new InternalServerErrorException('Failed to upload file. Please try again.');
    }

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
