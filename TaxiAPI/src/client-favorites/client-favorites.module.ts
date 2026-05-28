import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client, Driver, User } from '../entities';
import { ClientFavoriteDriver } from '../entities/client-favorite-driver.entity';
import { RedisModule } from '../redis/redis.module';
import { ClientFavoritesController } from './client-favorites.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClientFavoriteDriver, Client, Driver, User]),
    RedisModule,
  ],
  controllers: [ClientFavoritesController],
})
export class ClientFavoritesModule {}
