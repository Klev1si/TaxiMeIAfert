import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company, Driver } from '../entities';
import { DriverLedger, LedgerEntryType } from '../entities/driver-ledger.entity';

/** Default driver commission when the driver has no company. */
const DEFAULT_COMMISSION_PCT = Number(process.env.DRIVER_COMMISSION_PCT ?? 80);

export interface LedgerEntryDto {
  id:            string;
  type:          LedgerEntryType;
  amount:        number;
  rideId:        string | null;
  commissionPct: number | null;
  note:          string | null;
  createdAt:     Date;
}

export interface WalletDto {
  driverId:      string;
  totalCredits:  number;
  totalPayouts:  number;
  balance:       number;
  entries:       LedgerEntryDto[];
}

export interface DriverBalanceDto {
  driverId:     string;
  firstName:    string;
  lastName:     string;
  vehiclePlate: string;
  totalCredits: number;
  totalPayouts: number;
  balance:      number;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(DriverLedger)
    private readonly ledgerRepo: Repository<DriverLedger>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
  ) {}

  // ── Called fire-and-forget from RidesService on ride completion ─────────────

  /**
   * Create a credit ledger entry for the driver's share of a completed ride.
   * Swallows errors — a logging failure should never break a ride completion.
   */
  async creditRide(
    driverId:    string,
    rideId:      string,
    totalFare:   number,
  ): Promise<void> {
    try {
      if (totalFare <= 0) return;

      // Determine commission percentage
      const driver = await this.driverRepo.findOne({
        where:  { id: driverId },
        select: ['id', 'companyId'],
      });
      let commissionPct = DEFAULT_COMMISSION_PCT;
      if (driver?.companyId) {
        const company = await this.companyRepo.findOne({
          where:  { id: driver.companyId },
          select: ['driverCommissionPct'],
        });
        if (company) commissionPct = Number(company.driverCommissionPct);
      }

      const driverShare = Math.round(totalFare * commissionPct) / 100;
      if (driverShare <= 0) return;

      const entry = this.ledgerRepo.create({
        driverId,
        type:          'credit',
        amount:        driverShare,
        rideId,
        commissionPct,
        note:          null,
      });
      await this.ledgerRepo.save(entry);
    } catch (err) {
      this.logger.error(`Failed to credit driver ${driverId} for ride ${rideId}`, err);
    }
  }

  // ── Driver: get own wallet ──────────────────────────────────────────────────

  async getMyWallet(driverUserId: string): Promise<WalletDto> {
    const driver = await this.driverRepo.findOne({ where: { userId: driverUserId } });
    if (!driver) throw new NotFoundException('Driver profile not found');
    return this.buildWallet(driver.id, 50);
  }

  // ── Admin: get wallet for any driver ───────────────────────────────────────

  async getDriverWallet(driverId: string): Promise<WalletDto> {
    const driver = await this.driverRepo.findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');
    return this.buildWallet(driverId, 100);
  }

  // ── Admin: create payout debit entry ───────────────────────────────────────

  async createPayout(
    driverId: string,
    amount:   number,
    note:     string | undefined,
  ): Promise<LedgerEntryDto> {
    const driver = await this.driverRepo.findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');

    const balance = await this.computeBalance(driverId);
    if (amount > balance) {
      throw new BadRequestException(
        `Payout amount (${amount}) exceeds current balance (${balance.toFixed(2)})`,
      );
    }

    const entry = this.ledgerRepo.create({
      driverId,
      type:          'payout',
      amount:        Math.round(amount * 100) / 100,
      rideId:        null,
      commissionPct: null,
      note:          note ?? null,
    });
    const saved = await this.ledgerRepo.save(entry);
    this.logger.log(`Payout of ${amount} created for driver ${driverId}`);
    return this.toDto(saved);
  }

  // ── Admin: all driver balances (paginated, non-zero by default) ─────────────

  async getAllBalances(
    page:       number,
    limit:      number,
    nonZeroOnly = true,
  ): Promise<{ drivers: DriverBalanceDto[]; total: number }> {
    // Aggregate per driver in one query
    const rows: Array<{
      driverId:     string;
      firstName:    string;
      lastName:     string;
      vehiclePlate: string;
      credits:      string;
      payouts:      string;
    }> = await this.ledgerRepo.query(
      `SELECT
         dl.driver_id   AS "driverId",
         d.first_name   AS "firstName",
         d.last_name    AS "lastName",
         d.vehicle_plate AS "vehiclePlate",
         COALESCE(SUM(dl.amount) FILTER (WHERE dl.type = 'credit'), 0) AS credits,
         COALESCE(SUM(dl.amount) FILTER (WHERE dl.type = 'payout'), 0) AS payouts
       FROM driver_ledger dl
       JOIN drivers d ON d.id = dl.driver_id
       GROUP BY dl.driver_id, d.first_name, d.last_name, d.vehicle_plate
       ${nonZeroOnly ? 'HAVING (SUM(dl.amount) FILTER (WHERE dl.type = \'credit\') - COALESCE(SUM(dl.amount) FILTER (WHERE dl.type = \'payout\'), 0)) > 0' : ''}
       ORDER BY (COALESCE(SUM(dl.amount) FILTER (WHERE dl.type = 'credit'), 0)
                 - COALESCE(SUM(dl.amount) FILTER (WHERE dl.type = 'payout'), 0)) DESC
       LIMIT $1 OFFSET $2`,
      [limit, (page - 1) * limit],
    );

    // Count query (simplified)
    const countRows: Array<{ cnt: string }> = await this.ledgerRepo.query(
      `SELECT COUNT(DISTINCT driver_id) AS cnt
       FROM driver_ledger
       ${nonZeroOnly ? `WHERE driver_id IN (
         SELECT driver_id FROM driver_ledger
         GROUP BY driver_id
         HAVING (SUM(amount) FILTER (WHERE type = 'credit') - COALESCE(SUM(amount) FILTER (WHERE type = 'payout'), 0)) > 0
       )` : ''}`,
    );

    return {
      total: Number(countRows[0]?.cnt ?? 0),
      drivers: rows.map(r => {
        const credits = Number(r.credits);
        const payouts = Number(r.payouts);
        return {
          driverId:     r.driverId,
          firstName:    r.firstName,
          lastName:     r.lastName,
          vehiclePlate: r.vehiclePlate,
          totalCredits: Math.round(credits * 100) / 100,
          totalPayouts: Math.round(payouts * 100) / 100,
          balance:      Math.round((credits - payouts) * 100) / 100,
        };
      }),
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async buildWallet(driverId: string, limit: number): Promise<WalletDto> {
    const [entries, balance] = await Promise.all([
      this.ledgerRepo.find({
        where: { driverId },
        order: { createdAt: 'DESC' },
        take:  limit,
      }),
      this.computeBalance(driverId),
    ]);

    const totalCredits = entries
      .filter(e => e.type === 'credit')
      .reduce((s, e) => s + Number(e.amount), 0);

    const totalPayouts = entries
      .filter(e => e.type === 'payout')
      .reduce((s, e) => s + Number(e.amount), 0);

    return {
      driverId,
      totalCredits: Math.round(totalCredits * 100) / 100,
      totalPayouts: Math.round(totalPayouts * 100) / 100,
      balance:      Math.round(balance       * 100) / 100,
      entries: entries.map(this.toDto),
    };
  }

  private async computeBalance(driverId: string): Promise<number> {
    const row: Array<{ balance: string }> = await this.ledgerRepo.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE type = 'credit'), 0)
         - COALESCE(SUM(amount) FILTER (WHERE type = 'payout'), 0)
         AS balance
       FROM driver_ledger
       WHERE driver_id = $1`,
      [driverId],
    );
    return Number(row[0]?.balance ?? 0);
  }

  private toDto(entry: DriverLedger): LedgerEntryDto {
    return {
      id:            entry.id,
      type:          entry.type,
      amount:        Number(entry.amount),
      rideId:        entry.rideId,
      commissionPct: entry.commissionPct != null ? Number(entry.commissionPct) : null,
      note:          entry.note,
      createdAt:     entry.createdAt,
    };
  }
}
