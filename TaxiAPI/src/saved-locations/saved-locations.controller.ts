import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  IsString, IsNotEmpty, IsOptional, IsNumber,
  MaxLength, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SavedLocationsService } from './saved-locations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities';
import { UserRole } from '../common/enums';

// ── DTOs ──────────────────────────────────────────────────────────────────────

class CreateSavedLocationDto {
  @IsString() @IsNotEmpty() @MaxLength(40)
  label: string;

  @IsString() @MaxLength(200) @IsOptional()
  address?: string;

  @IsNumber() @Min(-90)  @Max(90)  @Type(() => Number)
  lat: number;

  @IsNumber() @Min(-180) @Max(180) @Type(() => Number)
  lng: number;
}

class UpdateSavedLocationDto {
  @IsString() @IsNotEmpty() @MaxLength(40) @IsOptional()
  label?: string;

  @IsString() @MaxLength(200) @IsOptional()
  address?: string | null;

  @IsNumber() @Min(-90)  @Max(90)  @Type(() => Number) @IsOptional()
  lat?: number;

  @IsNumber() @Min(-180) @Max(180) @Type(() => Number) @IsOptional()
  lng?: number;
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('saved-locations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CLIENT)
export class SavedLocationsController {
  constructor(private readonly service: SavedLocationsService) {}

  /** GET /saved-locations — list all for current client */
  @Get()
  findAll(@CurrentUser() user: User) {
    return this.service.findAll(user.id);
  }

  /** POST /saved-locations — create a new saved location */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateSavedLocationDto,
  ) {
    return this.service.create(user.id, dto);
  }

  /** PATCH /saved-locations/:id — update label / address / coordinates */
  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateSavedLocationDto,
  ) {
    return this.service.update(user.id, id, dto);
  }

  /** DELETE /saved-locations/:id */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<void> {
    return this.service.remove(user.id, id);
  }
}
