import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { SupportTicket, TicketCategory, TicketStatus, TicketPriority } from '../entities/support-ticket.entity';
import { SupportMessage } from '../entities/support-message.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../entities';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateTicketDto {
  category:  TicketCategory;
  subject:   string;
  body:      string;
  rideId?:   string | null;
}

export interface UpdateTicketDto {
  status?:   TicketStatus;
  priority?: TicketPriority;
}

export interface MessageDto {
  id:         string;
  authorId:   string;
  authorRole: 'user' | 'admin';
  body:       string;
  createdAt:  Date;
}

export interface TicketDto {
  id:          string;
  userId:      string;
  userRole:    string;
  category:    TicketCategory;
  subject:     string;
  status:      TicketStatus;
  priority:    TicketPriority;
  rideId:      string | null;
  resolvedAt:  Date | null;
  createdAt:   Date;
  updatedAt:   Date;
  messages:    MessageDto[];
}

export interface TicketSummaryDto {
  id:        string;
  userId:    string;
  userRole:  string;
  category:  TicketCategory;
  subject:   string;
  status:    TicketStatus;
  priority:  TicketPriority;
  rideId:    string | null;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepo: Repository<SupportTicket>,
    @InjectRepository(SupportMessage)
    private readonly msgRepo: Repository<SupportMessage>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ── User: create ticket ─────────────────────────────────────────────────────

  async createTicket(
    userId:   string,
    userRole: string,
    dto:      CreateTicketDto,
  ): Promise<TicketDto> {
    const ticket = this.ticketRepo.create({
      userId,
      userRole,
      category:  dto.category,
      subject:   dto.subject.trim(),
      status:    TicketStatus.OPEN,
      priority:  TicketPriority.NORMAL,
      rideId:    dto.rideId ?? null,
      resolvedAt: null,
    });
    const saved = await this.ticketRepo.save(ticket);

    // First message is the ticket body
    const msg = this.msgRepo.create({
      ticketId:   saved.id,
      authorId:   userId,
      authorRole: 'user',
      body:       dto.body.trim(),
    });
    await this.msgRepo.save(msg);

    return this.buildDto(saved, [msg]);
  }

  // ── User: list own tickets ──────────────────────────────────────────────────

  async getMyTickets(userId: string): Promise<TicketSummaryDto[]> {
    const tickets = await this.ticketRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });

    // Message counts via raw query (avoid loading all message bodies)
    if (tickets.length === 0) return [];
    const counts: Array<{ ticketId: string; cnt: string }> = await this.msgRepo.query(
      `SELECT ticket_id AS "ticketId", COUNT(*) AS cnt
       FROM support_messages
       WHERE ticket_id = ANY($1)
       GROUP BY ticket_id`,
      [tickets.map(t => t.id)],
    );
    const cntMap = new Map(counts.map(r => [r.ticketId, Number(r.cnt)]));

    return tickets.map(t => ({
      id:           t.id,
      userId:       t.userId,
      userRole:     t.userRole,
      category:     t.category,
      subject:      t.subject,
      status:       t.status,
      priority:     t.priority,
      rideId:       t.rideId,
      createdAt:    t.createdAt,
      updatedAt:    t.updatedAt,
      messageCount: cntMap.get(t.id) ?? 0,
    }));
  }

  // ── User: get own ticket with thread ───────────────────────────────────────

  async getMyTicket(userId: string, ticketId: string): Promise<TicketDto> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket)                  throw new NotFoundException('Ticket not found');
    if (ticket.userId !== userId) throw new ForbiddenException('Not your ticket');
    const messages = await this.getMessages(ticketId);
    return this.buildDto(ticket, messages);
  }

  // ── User: reply to own ticket ──────────────────────────────────────────────

  async addUserMessage(
    userId:   string,
    ticketId: string,
    body:     string,
  ): Promise<MessageDto> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket)                  throw new NotFoundException('Ticket not found');
    if (ticket.userId !== userId) throw new ForbiddenException('Not your ticket');
    if (ticket.status === TicketStatus.CLOSED) {
      throw new ForbiddenException('Cannot reply to a closed ticket');
    }

    // Re-open if resolved (user replied = needs attention again)
    if (ticket.status === TicketStatus.RESOLVED) {
      await this.ticketRepo.update(ticketId, { status: TicketStatus.OPEN, resolvedAt: null });
    }

    const msg = this.msgRepo.create({
      ticketId,
      authorId:   userId,
      authorRole: 'user',
      body:       body.trim(),
    });
    const saved = await this.msgRepo.save(msg);
    await this.ticketRepo.update(ticketId, { updatedAt: new Date() });
    return this.toMsgDto(saved);
  }

  // ── Admin: list all tickets ─────────────────────────────────────────────────

  async adminGetTickets(opts: {
    page:       number;
    limit:      number;
    status?:    TicketStatus;
    priority?:  TicketPriority;
    category?:  TicketCategory;
    userRole?:  string;
  }): Promise<{ tickets: TicketSummaryDto[]; total: number }> {
    const where: FindOptionsWhere<SupportTicket> = {};
    if (opts.status)   where.status   = opts.status;
    if (opts.priority) where.priority = opts.priority;
    if (opts.category) where.category = opts.category;
    if (opts.userRole) where.userRole = opts.userRole;

    const [tickets, total] = await this.ticketRepo.findAndCount({
      where,
      order: {
        // Urgent + open first, then by update time
        priority:  'DESC',
        updatedAt: 'DESC',
      },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    });

    if (tickets.length === 0) return { tickets: [], total };

    const counts: Array<{ ticketId: string; cnt: string }> = await this.msgRepo.query(
      `SELECT ticket_id AS "ticketId", COUNT(*) AS cnt
       FROM support_messages
       WHERE ticket_id = ANY($1)
       GROUP BY ticket_id`,
      [tickets.map(t => t.id)],
    );
    const cntMap = new Map(counts.map(r => [r.ticketId, Number(r.cnt)]));

    return {
      total,
      tickets: tickets.map(t => ({
        id:           t.id,
        userId:       t.userId,
        userRole:     t.userRole,
        category:     t.category,
        subject:      t.subject,
        status:       t.status,
        priority:     t.priority,
        rideId:       t.rideId,
        createdAt:    t.createdAt,
        updatedAt:    t.updatedAt,
        messageCount: cntMap.get(t.id) ?? 0,
      })),
    };
  }

  // ── Admin: view single ticket ───────────────────────────────────────────────

  async adminGetTicket(ticketId: string): Promise<TicketDto> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const messages = await this.getMessages(ticketId);
    return this.buildDto(ticket, messages);
  }

  // ── Admin: update status / priority ────────────────────────────────────────

  async adminUpdateTicket(
    ticketId: string,
    dto:      UpdateTicketDto,
  ): Promise<TicketDto> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const patch: Partial<SupportTicket> = {};
    if (dto.status !== undefined) {
      patch.status = dto.status;
      if (dto.status === TicketStatus.RESOLVED || dto.status === TicketStatus.CLOSED) {
        patch.resolvedAt = new Date();
      } else {
        patch.resolvedAt = null;
      }
    }
    if (dto.priority !== undefined) patch.priority = dto.priority;

    await this.ticketRepo.update(ticketId, patch);
    const updated = { ...ticket, ...patch };
    const messages = await this.getMessages(ticketId);
    return this.buildDto(updated as SupportTicket, messages);
  }

  // ── Admin: reply to ticket ──────────────────────────────────────────────────

  async adminAddMessage(
    adminId:  string,
    ticketId: string,
    body:     string,
  ): Promise<MessageDto> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === TicketStatus.CLOSED) {
      throw new ForbiddenException('Cannot reply to a closed ticket');
    }

    const msg = this.msgRepo.create({
      ticketId,
      authorId:   adminId,
      authorRole: 'admin',
      body:       body.trim(),
    });
    const saved = await this.msgRepo.save(msg);

    // Move to in_progress if still open
    if (ticket.status === TicketStatus.OPEN) {
      await this.ticketRepo.update(ticketId, { status: TicketStatus.IN_PROGRESS });
    } else {
      await this.ticketRepo.update(ticketId, { updatedAt: new Date() });
    }

    // Notify the user (fire-and-forget)
    const user = await this.userRepo.findOne({
      where:  { id: ticket.userId },
      select: ['fcmToken'],
    });
    void this.notificationsService.sendToToken(user?.fcmToken, {
      title: '💬 Support reply',
      body:  `Your ticket "${ticket.subject}" has a new reply.`,
      data:  { event: 'support_reply', ticketId },
    });

    return this.toMsgDto(saved);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async getMessages(ticketId: string): Promise<SupportMessage[]> {
    return this.msgRepo.find({
      where: { ticketId },
      order: { createdAt: 'ASC' },
    });
  }

  private buildDto(ticket: SupportTicket, messages: SupportMessage[]): TicketDto {
    return {
      id:         ticket.id,
      userId:     ticket.userId,
      userRole:   ticket.userRole,
      category:   ticket.category,
      subject:    ticket.subject,
      status:     ticket.status,
      priority:   ticket.priority,
      rideId:     ticket.rideId,
      resolvedAt: ticket.resolvedAt,
      createdAt:  ticket.createdAt,
      updatedAt:  ticket.updatedAt,
      messages:   messages.map(this.toMsgDto),
    };
  }

  private toMsgDto(m: SupportMessage): MessageDto {
    return {
      id:         m.id,
      authorId:   m.authorId,
      authorRole: m.authorRole,
      body:       m.body,
      createdAt:  m.createdAt,
    };
  }
}
