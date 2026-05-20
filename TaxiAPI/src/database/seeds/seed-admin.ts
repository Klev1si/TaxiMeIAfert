/**
 * Seed script — creates the super_admin account.
 * Run once with: npx ts-node -r tsconfig-paths/register src/database/seeds/seed-admin.ts
 *
 * Reads DB connection from environment (.env in project root).
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  User, Client, Driver, Company,
  SubscriptionPlan, CompanySubscription, Tariff, Ride, Expense,
} from '../../entities';
import { UserRole } from '../../common/enums/user-role.enum';

const ADMIN_PHONE    = process.env.ADMIN_PHONE    ?? '+10000000000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin@12345';

async function seed() {
  const ds = new DataSource({
    type: 'postgres',
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'taxiapp',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME     ?? 'taxiapp_db',
    entities: [User, Client, Driver, Company, SubscriptionPlan, CompanySubscription, Tariff, Ride, Expense],
    synchronize: false,
  });

  await ds.initialize();

  const userRepo = ds.getRepository(User);
  const existing = await userRepo.findOne({ where: { phone: ADMIN_PHONE } });

  if (existing) {
    console.log(`✅ Admin already exists (phone: ${ADMIN_PHONE})`);
    await ds.destroy();
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = userRepo.create({
    phone: ADMIN_PHONE,
    passwordHash,
    role: UserRole.SUPER_ADMIN,
    isPhoneVerified: true,
    isActive: true,
  });
  await userRepo.save(admin);

  console.log('🎉 Super admin created!');
  console.log(`   Phone:    ${ADMIN_PHONE}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log('   Log in at http://localhost:5173');

  await ds.destroy();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
