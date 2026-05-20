import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { WalletService, WalletDto } from './wallet.service';

/** Driver-facing wallet endpoint. */
@Controller('driver/wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DRIVER)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  /**
   * GET /driver/wallet
   * Returns the driver's current balance and the last 50 ledger entries.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  getMyWallet(
    @Request() req: { user: { id: string } },
  ): Promise<WalletDto> {
    return this.walletService.getMyWallet(req.user.id);
  }
}
