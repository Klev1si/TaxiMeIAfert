import { Module } from '@nestjs/common';
import { PayseraService } from './paysera.service.js';

@Module({
  providers: [PayseraService],
  exports: [PayseraService],
})
export class PayseraModule {}
