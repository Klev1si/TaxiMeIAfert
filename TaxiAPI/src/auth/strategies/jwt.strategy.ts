import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../../entities';

/** Only write last_active_at when it's older than this — avoids a DB write per request. */
const LAST_ACTIVE_WRITE_INTERVAL_MS = 10 * 60 * 1000;

export interface JwtPayload {
  sub: string;    // user id
  phone: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id: payload.sub, isActive: true },
    });
    if (!user) throw new UnauthorizedException('User not found or inactive');

    const now = Date.now();
    if (!user.lastActiveAt || now - user.lastActiveAt.getTime() > LAST_ACTIVE_WRITE_INTERVAL_MS) {
      user.lastActiveAt = new Date(now);
      // Fire-and-forget — activity tracking must never fail the request.
      // Raw query so users.updated_at keeps meaning "profile changed".
      this.userRepo
        .query('UPDATE users SET last_active_at = $1 WHERE id = $2', [user.lastActiveAt, user.id])
        .catch(() => undefined);
    }
    return user;
  }
}
