/**
 * Seed script — creates the super_admin account.
 * Run once with: npx ts-node -r tsconfig-paths/register src/database/seeds/seed-admin.ts
 *
 * Reads DB connection from environment variables.
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../data-source';
import { User } from '../../entities';
import { UserRole } from '../../common/enums/user-role.enum';

dotenv.config();

const ADMIN_PHONE    = process.env.ADMIN_PHONE    ?? '+10000000000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin@12345';

async function seed() {
  await AppDataSource.initialize();

  const userRepo = AppDataSource.getRepository(User);
  const existing = await userRepo.findOne({ where: { phone: ADMIN_PHONE } });

  if (existing) {
    console.log(`✅ Admin already exists (phone: ${ADMIN_PHONE})`);
    await AppDataSource.destroy();
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = userRepo.create({
    phone:           ADMIN_PHONE,
    passwordHash,
    role:            UserRole.SUPER_ADMIN,
    isPhoneVerified: true,
    isActive:        true,
  });
  await userRepo.save(admin);

  console.log('🎉 Super admin created!');
  console.log(`   Phone:    ${ADMIN_PHONE}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
