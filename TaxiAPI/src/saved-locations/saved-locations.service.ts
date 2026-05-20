import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client, SavedLocation } from '../entities';

const MAX_PER_CLIENT = 20;

@Injectable()
export class SavedLocationsService {
  constructor(
    @InjectRepository(SavedLocation)
    private readonly repo: Repository<SavedLocation>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async resolveClientId(userId: string): Promise<string> {
    const client = await this.clientRepo.findOne({
      where: { userId },
      select: ['id'],
    });
    if (!client) throw new NotFoundException('Client profile not found');
    return client.id;
  }

  private map(s: SavedLocation) {
    return {
      id:        s.id,
      label:     s.label,
      address:   s.address,
      lat:       Number(s.lat),
      lng:       Number(s.lng),
      createdAt: s.createdAt,
    };
  }

  // ── GET /saved-locations ───────────────────────────────────────────────────

  async findAll(userId: string) {
    const clientId = await this.resolveClientId(userId);
    const locations = await this.repo.find({
      where: { clientId },
      order: { createdAt: 'ASC' },
    });
    return locations.map(s => this.map(s));
  }

  // ── POST /saved-locations ──────────────────────────────────────────────────

  async create(
    userId: string,
    dto: { label: string; address?: string; lat: number; lng: number },
  ) {
    const clientId = await this.resolveClientId(userId);

    const count = await this.repo.count({ where: { clientId } });
    if (count >= MAX_PER_CLIENT) {
      throw new BadRequestException(
        `You can save up to ${MAX_PER_CLIENT} locations. Please delete one first.`,
      );
    }

    const saved = await this.repo.save(
      this.repo.create({
        clientId,
        label:   dto.label.trim(),
        address: dto.address?.trim() || null,
        lat:     dto.lat,
        lng:     dto.lng,
      }),
    );
    return this.map(saved);
  }

  // ── PATCH /saved-locations/:id ─────────────────────────────────────────────

  async update(
    userId: string,
    locationId: string,
    dto: { label?: string; address?: string | null; lat?: number; lng?: number },
  ) {
    const clientId = await this.resolveClientId(userId);
    const location = await this.repo.findOne({ where: { id: locationId } });
    if (!location)             throw new NotFoundException('Saved location not found');
    if (location.clientId !== clientId) throw new ForbiddenException('Access denied');

    if (dto.label   !== undefined) location.label   = dto.label.trim();
    if (dto.address !== undefined) location.address = dto.address?.trim() || null;
    if (dto.lat     !== undefined) location.lat     = dto.lat;
    if (dto.lng     !== undefined) location.lng     = dto.lng;

    const saved = await this.repo.save(location);
    return this.map(saved);
  }

  // ── DELETE /saved-locations/:id ────────────────────────────────────────────

  async remove(userId: string, locationId: string): Promise<void> {
    const clientId = await this.resolveClientId(userId);
    const location = await this.repo.findOne({ where: { id: locationId } });
    if (!location)             throw new NotFoundException('Saved location not found');
    if (location.clientId !== clientId) throw new ForbiddenException('Access denied');
    await this.repo.remove(location);
  }
}
