import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { Driver, User } from '../entities';
import { DriverDocument } from '../entities/driver-document.entity';
import { DocumentStatus, DocumentType } from '../common/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';

export interface DocumentDto {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  fileUrl: string;
  originalName: string | null;
  rejectionReason: string | null;
  reviewedAt: Date | null;
  uploadedAt: Date;
}

@Injectable()
export class DriverDocumentsService {
  private readonly logger = new Logger(DriverDocumentsService.name);

  constructor(
    @InjectRepository(DriverDocument)
    private readonly docRepo: Repository<DriverDocument>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  // ── Driver: get own documents ───────────────────────────────────────────────
  async getMyDocuments(driverUserId: string): Promise<DocumentDto[]> {
    const driver = await this.resolveDriver(driverUserId);
    const docs = await this.docRepo.find({
      where: { driverId: driver.id },
      order: { uploadedAt: 'DESC' },
    });
    return docs.map(this.toDto);
  }

  // ── Driver: upload document ─────────────────────────────────────────────────
  async uploadDocument(
    driverUserId: string,
    type: DocumentType,
    fileUrl: string,
    originalName: string | null,
  ): Promise<DocumentDto> {
    const driver = await this.resolveDriver(driverUserId);

    // Replace existing document of the same type (only one per type allowed)
    const existing = await this.docRepo.findOne({
      where: { driverId: driver.id, type },
    });
    if (existing) {
      this.deleteFile(existing.fileUrl);
      await this.docRepo.remove(existing);
    }

    const doc = this.docRepo.create({
      driverId: driver.id,
      type,
      status: DocumentStatus.PENDING,
      fileUrl,
      originalName,
    });
    const saved = await this.docRepo.save(doc);
    this.logger.log(`Driver ${driver.id} uploaded ${type} document`);
    return this.toDto(saved);
  }

  // ── Driver: delete own pending document ──────────────────────────────────────
  async deleteMyDocument(driverUserId: string, docId: string): Promise<void> {
    const driver = await this.resolveDriver(driverUserId);
    const doc = await this.docRepo.findOne({ where: { id: docId } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.driverId !== driver.id) throw new ForbiddenException('Not your document');
    if (doc.status === DocumentStatus.APPROVED) {
      throw new BadRequestException('Approved documents cannot be deleted');
    }
    this.deleteFile(doc.fileUrl);
    await this.docRepo.remove(doc);
  }

  // ── Admin: list documents for any driver ────────────────────────────────────
  async getDriverDocuments(driverId: string): Promise<DocumentDto[]> {
    const driver = await this.driverRepo.findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');
    const docs = await this.docRepo.find({
      where: { driverId },
      order: { uploadedAt: 'DESC' },
    });
    return docs.map(this.toDto);
  }

  // ── Admin: approve document ──────────────────────────────────────────────────
  async approveDocument(
    adminUserId: string,
    driverId: string,
    docId: string,
  ): Promise<DocumentDto> {
    const { doc, driver } = await this.resolveAdminDocAction(driverId, docId);

    doc.status = DocumentStatus.APPROVED;
    doc.reviewedBy = adminUserId;
    doc.reviewedAt = new Date();
    doc.rejectionReason = null;
    const saved = await this.docRepo.save(doc);

    // Notify driver
    const driverUser = await this.userRepo.findOne({
      where: { id: driver.userId },
      select: ['fcmToken'],
    });
    await this.notificationsService.sendToToken(driverUser?.fcmToken, {
      title: '✅ Document Approved',
      body: `Your ${this.friendlyType(doc.type)} has been approved.`,
      data: { event: 'document_approved', docId: doc.id, type: doc.type },
    });

    void this.auditService.log({
      adminId: adminUserId,
      action: 'document.approved', targetType: 'document', targetId: docId,
      metadata: { driverId, docType: doc.type },
    });

    this.logger.log(`Admin ${adminUserId} approved doc ${docId} for driver ${driverId}`);
    return this.toDto(saved);
  }

  // ── Admin: reject document ───────────────────────────────────────────────────
  async rejectDocument(
    adminUserId: string,
    driverId: string,
    docId: string,
    reason: string | undefined,
  ): Promise<DocumentDto> {
    const { doc, driver } = await this.resolveAdminDocAction(driverId, docId);

    doc.status = DocumentStatus.REJECTED;
    doc.reviewedBy = adminUserId;
    doc.reviewedAt = new Date();
    doc.rejectionReason = reason ?? null;
    const saved = await this.docRepo.save(doc);

    // Notify driver
    const driverUser = await this.userRepo.findOne({
      where: { id: driver.userId },
      select: ['fcmToken'],
    });
    const bodyText = reason
      ? `Your ${this.friendlyType(doc.type)} was rejected: ${reason}`
      : `Your ${this.friendlyType(doc.type)} was rejected. Please re-upload.`;
    await this.notificationsService.sendToToken(driverUser?.fcmToken, {
      title: '❌ Document Rejected',
      body: bodyText,
      data: { event: 'document_rejected', docId: doc.id, type: doc.type },
    });

    void this.auditService.log({
      adminId: adminUserId,
      action: 'document.rejected', targetType: 'document', targetId: docId,
      metadata: { driverId, docType: doc.type, reason: reason ?? null },
    });

    this.logger.log(`Admin ${adminUserId} rejected doc ${docId} for driver ${driverId}`);
    return this.toDto(saved);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async resolveDriver(userId: string): Promise<Driver> {
    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver) throw new NotFoundException('Driver profile not found');
    return driver;
  }

  private async resolveAdminDocAction(
    driverId: string,
    docId: string,
  ): Promise<{ doc: DriverDocument; driver: Driver }> {
    const driver = await this.driverRepo.findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');
    const doc = await this.docRepo.findOne({ where: { id: docId } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.driverId !== driverId) throw new ForbiddenException('Document does not belong to this driver');
    return { doc, driver };
  }

  private deleteFile(fileUrl: string): void {
    try {
      // fileUrl is stored as a relative path like /uploads/documents/xxx.jpg
      const abs = join(process.cwd(), fileUrl);
      if (existsSync(abs)) unlinkSync(abs);
    } catch {
      // Non-fatal — log but don't throw
      this.logger.warn(`Failed to delete file: ${fileUrl}`);
    }
  }

  private toDto(doc: DriverDocument): DocumentDto {
    return {
      id:              doc.id,
      type:            doc.type,
      status:          doc.status,
      fileUrl:         doc.fileUrl,
      originalName:    doc.originalName,
      rejectionReason: doc.rejectionReason,
      reviewedAt:      doc.reviewedAt,
      uploadedAt:      doc.uploadedAt,
    };
  }

  private friendlyType(type: DocumentType): string {
    const map: Record<DocumentType, string> = {
      [DocumentType.LICENSE]:              "driver's license",
      [DocumentType.VEHICLE_REGISTRATION]: 'vehicle registration',
      [DocumentType.INSURANCE]:            'insurance certificate',
      [DocumentType.OTHER]:                'document',
    };
    return map[type] ?? type;
  }
}
