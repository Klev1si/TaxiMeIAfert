import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import { Driver, Expense } from '../entities/index.js';
import { ExpenseType } from '../common/enums/index.js';

// ── Period helpers ─────────────────────────────────────────────────────────────

function periodStart(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case 'today': {
      const d = new Date(now);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
    case 'week': {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - 6);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
    case 'month': {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - 29);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
    default:
      return null; // 'all'
  }
}

// ── DTOs (plain interfaces — validated in controller) ─────────────────────────

export interface CreateExpenseDto {
  type: ExpenseType;
  amount: number;
  description?: string;
  expenseDate: string; // ISO date string 'YYYY-MM-DD'
  receiptUrl?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
  ) {}

  /** Resolve driverId from userId (throws 404 if not found / not approved) */
  private async resolveDriverId(userId: string): Promise<string> {
    const driver = await this.driverRepo.findOne({
      where: { userId },
      select: ['id'],
    });
    if (!driver) {
      throw new NotFoundException('Driver profile not found');
    }
    return driver.id;
  }

  /** GET /expenses — list driver's expenses, optionally filtered by period & type */
  async findAll(
    userId: string,
    period = 'all',
    type?: ExpenseType,
  ): Promise<{ expenses: Expense[]; totals: Record<string, number>; grandTotal: number }> {
    const driverId = await this.resolveDriverId(userId);

    const where: Record<string, unknown> = { driverId };

    const start = periodStart(period);
    if (start) {
      where['expenseDate'] = MoreThanOrEqual(start);
    }
    if (type) {
      where['type'] = type;
    }

    const expenses = await this.expenseRepo.find({
      where,
      order: { expenseDate: 'DESC', createdAt: 'DESC' },
    });

    // Calculate totals per type + grand total
    const totals: Record<string, number> = {};
    let grandTotal = 0;
    for (const e of expenses) {
      const amt = Number(e.amount);
      totals[e.type] = (totals[e.type] ?? 0) + amt;
      grandTotal += amt;
    }

    return { expenses, totals, grandTotal };
  }

  /** POST /expenses — record a new expense for the authenticated driver */
  async create(userId: string, dto: CreateExpenseDto): Promise<Expense> {
    const driverId = await this.resolveDriverId(userId);

    const expense = this.expenseRepo.create({
      driverId,
      type: dto.type,
      amount: dto.amount,
      description: dto.description ?? null,
      expenseDate: new Date(dto.expenseDate),
      receiptUrl: dto.receiptUrl ?? null,
    });

    return this.expenseRepo.save(expense);
  }

  /** DELETE /expenses/:id — remove the driver's own expense */
  async remove(userId: string, expenseId: string): Promise<void> {
    const driverId = await this.resolveDriverId(userId);
    const expense = await this.expenseRepo.findOne({ where: { id: expenseId } });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }
    if (expense.driverId !== driverId) {
      throw new ForbiddenException('Not your expense');
    }

    await this.expenseRepo.remove(expense);
  }
}
