import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../entities';

export interface LogParams {
  adminId:    string;
  adminPhone?: string | null;
  action:     string;        // e.g. 'driver.approved'
  targetType: string;        // e.g. 'driver'
  targetId?:  string | null;
  metadata?:  Record<string, unknown> | null;
}

export interface AuditLogDto {
  id:          string;
  adminId:     string;
  adminPhone:  string | null;
  action:      string;
  targetType:  string;
  targetId:    string | null;
  metadata:    Record<string, unknown> | null;
  createdAt:   Date;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  /**
   * Append-only log entry.  Never throws — failures are swallowed so that
   * a logging error never breaks a business operation.
   */
  async log(params: LogParams): Promise<void> {
    try {
      const entry = this.repo.create({
        adminId:    params.adminId,
        adminPhone: params.adminPhone ?? null,
        action:     params.action,
        targetType: params.targetType,
        targetId:   params.targetId   ?? null,
        metadata:   params.metadata   ?? null,
      });
      await this.repo.save(entry);
    } catch (err) {
      this.logger.error('Failed to write audit log', err);
    }
  }

  /**
   * Paginated log query for the admin dashboard.
   * Supports optional filtering by adminId, action prefix, targetType, and date range.
   */
  async getLogs(opts: {
    page:        number;
    limit:       number;
    adminId?:    string;
    action?:     string;
    targetType?: string;
    from?:       Date;
    to?:         Date;
  }): Promise<{ logs: AuditLogDto[]; total: number }> {
    const qb = this.repo
      .createQueryBuilder('al')
      .orderBy('al.createdAt', 'DESC')
      .skip((opts.page - 1) * opts.limit)
      .take(opts.limit);

    if (opts.adminId)    qb.andWhere('al.adminId = :adminId',           { adminId:    opts.adminId });
    if (opts.action)     qb.andWhere('al.action LIKE :action',          { action:     `${opts.action}%` });
    if (opts.targetType) qb.andWhere('al.targetType = :targetType',     { targetType: opts.targetType });
    if (opts.from)       qb.andWhere('al.createdAt >= :from',           { from:       opts.from });
    if (opts.to)         qb.andWhere('al.createdAt <= :to',             { to:         opts.to });

    const [rows, total] = await qb.getManyAndCount();
    return {
      total,
      logs: rows.map(r => ({
        id:         r.id,
        adminId:    r.adminId,
        adminPhone: r.adminPhone,
        action:     r.action,
        targetType: r.targetType,
        targetId:   r.targetId,
        metadata:   r.metadata,
        createdAt:  r.createdAt,
      })),
    };
  }
}
