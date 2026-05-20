import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
  IsUrl,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExpensesService } from './expenses.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { User } from '../entities/index.js';
import { UserRole, ExpenseType } from '../common/enums/index.js';

// ── DTOs ──────────────────────────────────────────────────────────────────────

class CreateExpenseDto {
  @IsEnum(ExpenseType)
  type: ExpenseType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999.99)
  @Type(() => Number)
  amount: number;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  description?: string;

  @IsDateString()
  expenseDate: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  receiptUrl?: string;
}

class ExpenseQueryDto {
  /** today | week | month | all */
  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsEnum(ExpenseType)
  type?: ExpenseType;
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DRIVER)
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  /**
   * GET /expenses
   * Query: period=today|week|month|all  type=fuel|parking|maintenance|toll|other
   */
  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query() query: ExpenseQueryDto,
  ) {
    return this.service.findAll(user.id, query.period, query.type);
  }

  /** POST /expenses */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.service.create(user.id, dto);
  }

  /** DELETE /expenses/:id */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<void> {
    return this.service.remove(user.id, id);
  }
}
