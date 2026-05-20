import {
  Body, Controller, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post, Query,
  Request, UseGuards, DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import {
  IsEnum, IsNotEmpty, IsOptional, IsString,
  IsUUID, MaxLength, MinLength,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import {
  SupportService,
  CreateTicketDto,
  UpdateTicketDto,
} from './support.service';
import { TicketCategory, TicketPriority, TicketStatus } from '../entities/support-ticket.entity';

// ── DTOs ─────────────────────────────────────────────────────────────────────

class CreateTicketBody implements CreateTicketDto {
  @IsEnum(TicketCategory)
  category: TicketCategory;

  @IsString() @IsNotEmpty() @MaxLength(200)
  subject: string;

  @IsString() @IsNotEmpty() @MinLength(10) @MaxLength(3000)
  body: string;

  @IsUUID() @IsOptional()
  rideId?: string | null;
}

class AddMessageBody {
  @IsString() @IsNotEmpty() @MinLength(2) @MaxLength(3000)
  body: string;
}

class AdminUpdateBody implements UpdateTicketDto {
  @IsEnum(TicketStatus) @IsOptional()
  status?: TicketStatus;

  @IsEnum(TicketPriority) @IsOptional()
  priority?: TicketPriority;
}

// ── User routes (/support/tickets) ───────────────────────────────────────────

@Controller('support/tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CLIENT, UserRole.DRIVER)
export class SupportController {
  constructor(private readonly svc: SupportService) {}

  /** POST /support/tickets */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createTicket(
    @Request() req: { user: { id: string; role: string } },
    @Body() dto: CreateTicketBody,
  ) {
    return this.svc.createTicket(req.user.id, req.user.role, dto);
  }

  /** GET /support/tickets */
  @Get()
  getMyTickets(@Request() req: { user: { id: string } }) {
    return this.svc.getMyTickets(req.user.id);
  }

  /** GET /support/tickets/:id */
  @Get(':id')
  getMyTicket(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getMyTicket(req.user.id, id);
  }

  /** POST /support/tickets/:id/messages */
  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  addMessage(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMessageBody,
  ) {
    return this.svc.addUserMessage(req.user.id, id, dto.body);
  }
}

// ── Admin routes (/admin/support/tickets) ────────────────────────────────────

@Controller('admin/support/tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class AdminSupportController {
  constructor(private readonly svc: SupportService) {}

  /**
   * GET /admin/support/tickets
   * ?page=1&limit=20&status=open&priority=urgent&category=payment&userRole=driver
   */
  @Get()
  adminGetTickets(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:  number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status')   status?:   string,
    @Query('priority') priority?: string,
    @Query('category') category?: string,
    @Query('userRole') userRole?: string,
  ) {
    return this.svc.adminGetTickets({
      page,
      limit: Math.min(limit, 100),
      status:   status   as TicketStatus   | undefined,
      priority: priority as TicketPriority | undefined,
      category: category as TicketCategory | undefined,
      userRole,
    });
  }

  /** GET /admin/support/tickets/:id */
  @Get(':id')
  adminGetTicket(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.adminGetTicket(id);
  }

  /** PATCH /admin/support/tickets/:id */
  @Patch(':id')
  adminUpdateTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateBody,
  ) {
    return this.svc.adminUpdateTicket(id, dto);
  }

  /** POST /admin/support/tickets/:id/messages */
  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  adminAddMessage(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMessageBody,
  ) {
    return this.svc.adminAddMessage(req.user.id, id, dto.body);
  }
}
