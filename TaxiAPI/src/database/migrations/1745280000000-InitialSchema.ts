import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1745280000000 implements MigrationInterface {
  name = 'InitialSchema1745280000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── ENUMS ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "user_role" AS ENUM (
        'super_admin', 'company', 'driver', 'client'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "ride_status" AS ENUM (
        'requested', 'accepted', 'driving_to_pickup',
        'in_progress', 'completed', 'cancelled'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "payment_status" AS ENUM (
        'pending', 'paid', 'failed', 'refunded'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "subscription_status" AS ENUM (
        'active', 'past_due', 'cancelled', 'trialing'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "expense_type" AS ENUM (
        'fuel', 'parking', 'maintenance', 'toll', 'other'
      )
    `);

    // ── TABLE: users ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"                UUID          NOT NULL DEFAULT gen_random_uuid(),
        "phone"             VARCHAR(20)   NOT NULL,
        "email"             VARCHAR(255),
        "password_hash"     VARCHAR(255)  NOT NULL,
        "role"              "user_role"   NOT NULL,
        "is_phone_verified" BOOLEAN       NOT NULL DEFAULT false,
        "is_active"         BOOLEAN       NOT NULL DEFAULT true,
        "refresh_token"     VARCHAR(500),
        "fcm_token"         VARCHAR(500),
        "created_at"        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_phone" UNIQUE ("phone"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    // ── TABLE: subscription_plans ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "subscription_plans" (
        "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
        "name"            VARCHAR(80)   NOT NULL,
        "price_monthly"   DECIMAL(10,2) NOT NULL,
        "max_drivers"     INT           NOT NULL,
        "features"        JSONB         NOT NULL DEFAULT '[]',
        "stripe_price_id" VARCHAR(100),
        "is_active"       BOOLEAN       NOT NULL DEFAULT true,
        "created_at"      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_subscription_plans" PRIMARY KEY ("id")
      )
    `);

    // ── TABLE: companies ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "companies" (
        "id"                 UUID          NOT NULL DEFAULT gen_random_uuid(),
        "user_id"            UUID          NOT NULL,
        "name"               VARCHAR(150)  NOT NULL,
        "logo_url"           VARCHAR(500),
        "address"            VARCHAR(300),
        "city"               VARCHAR(100),
        "is_approved"        BOOLEAN       NOT NULL DEFAULT false,
        "approved_at"        TIMESTAMPTZ,
        "stripe_customer_id" VARCHAR(100),
        "created_at"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_companies" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_companies_user_id" UNIQUE ("user_id"),
        CONSTRAINT "FK_companies_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // ── TABLE: drivers ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "drivers" (
        "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
        "user_id"          UUID          NOT NULL,
        "company_id"       UUID,
        "first_name"       VARCHAR(80)   NOT NULL,
        "last_name"        VARCHAR(80)   NOT NULL,
        "photo_url"        VARCHAR(500),
        "license_number"   VARCHAR(50)   NOT NULL,
        "vehicle_make"     VARCHAR(60)   NOT NULL,
        "vehicle_model"    VARCHAR(60)   NOT NULL,
        "vehicle_year"     SMALLINT      NOT NULL,
        "vehicle_plate"    VARCHAR(20)   NOT NULL,
        "vehicle_color"    VARCHAR(40),
        "is_approved"      BOOLEAN       NOT NULL DEFAULT false,
        "is_online"        BOOLEAN       NOT NULL DEFAULT false,
        "current_lat"      DECIMAL(9,6),
        "current_lng"      DECIMAL(9,6),
        "last_location_at" TIMESTAMPTZ,
        "rating"           DECIMAL(3,2)  NOT NULL DEFAULT 0,
        "total_rides"      INT           NOT NULL DEFAULT 0,
        "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_drivers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_drivers_user_id" UNIQUE ("user_id"),
        CONSTRAINT "FK_drivers_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_drivers_company_id"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL
      )
    `);

    // ── TABLE: clients ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "clients" (
        "id"                 UUID          NOT NULL DEFAULT gen_random_uuid(),
        "user_id"            UUID          NOT NULL,
        "first_name"         VARCHAR(80)   NOT NULL,
        "last_name"          VARCHAR(80)   NOT NULL,
        "photo_url"          VARCHAR(500),
        "rating"             DECIMAL(3,2)  NOT NULL DEFAULT 0,
        "total_rides"        INT           NOT NULL DEFAULT 0,
        "stripe_customer_id" VARCHAR(100),
        "created_at"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_clients" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_clients_user_id" UNIQUE ("user_id"),
        CONSTRAINT "FK_clients_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // ── TABLE: company_subscriptions ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "company_subscriptions" (
        "id"                     UUID                  NOT NULL DEFAULT gen_random_uuid(),
        "company_id"             UUID                  NOT NULL,
        "plan_id"                UUID                  NOT NULL,
        "stripe_subscription_id" VARCHAR(100),
        "status"                 "subscription_status" NOT NULL DEFAULT 'trialing',
        "current_period_start"   TIMESTAMPTZ           NOT NULL,
        "current_period_end"     TIMESTAMPTZ           NOT NULL,
        "cancelled_at"           TIMESTAMPTZ,
        "created_at"             TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
        "updated_at"             TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_company_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_company_subs_stripe_id" UNIQUE ("stripe_subscription_id"),
        CONSTRAINT "FK_company_subs_company_id"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_company_subs_plan_id"
          FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id")
      )
    `);

    // ── TABLE: tariffs ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "tariffs" (
        "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
        "company_id"       UUID          NOT NULL,
        "name"             VARCHAR(80)   NOT NULL,
        "base_fare"        DECIMAL(10,2) NOT NULL,
        "per_km_rate"      DECIMAL(10,2) NOT NULL,
        "per_minute_rate"  DECIMAL(10,2) NOT NULL,
        "minimum_fare"     DECIMAL(10,2) NOT NULL,
        "is_night_tariff"  BOOLEAN       NOT NULL DEFAULT false,
        "night_start_hour" SMALLINT,
        "night_end_hour"   SMALLINT,
        "is_active"        BOOLEAN       NOT NULL DEFAULT true,
        "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_tariffs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tariffs_company_id"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);

    // ── TABLE: rides ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "rides" (
        "id"                       UUID             NOT NULL DEFAULT gen_random_uuid(),
        "client_id"                UUID             NOT NULL,
        "driver_id"                UUID,
        "company_id"               UUID,
        "tariff_id"                UUID,
        "status"                   "ride_status"    NOT NULL DEFAULT 'requested',
        "pickup_lat"               DECIMAL(9,6)     NOT NULL,
        "pickup_lng"               DECIMAL(9,6)     NOT NULL,
        "pickup_address"           VARCHAR(300),
        "dropoff_lat"              DECIMAL(9,6),
        "dropoff_lng"              DECIMAL(9,6),
        "dropoff_address"          VARCHAR(300),
        "distance_km"              DECIMAL(8,3),
        "duration_minutes"         DECIMAL(8,2),
        "base_fare"                DECIMAL(10,2),
        "distance_fare"            DECIMAL(10,2),
        "time_fare"                DECIMAL(10,2),
        "total_fare"               DECIMAL(10,2),
        "payment_status"           "payment_status" NOT NULL DEFAULT 'pending',
        "stripe_payment_intent_id" VARCHAR(100),
        "client_rating"            SMALLINT         CHECK ("client_rating" BETWEEN 1 AND 5),
        "driver_rating"            SMALLINT         CHECK ("driver_rating" BETWEEN 1 AND 5),
        "client_review"            VARCHAR(500),
        "driver_review"            VARCHAR(500),
        "cancel_reason"            VARCHAR(300),
        "cancelled_by"             "user_role",
        "created_at"               TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
        "accepted_at"              TIMESTAMPTZ,
        "pickup_arrived_at"        TIMESTAMPTZ,
        "started_at"               TIMESTAMPTZ,
        "completed_at"             TIMESTAMPTZ,
        "cancelled_at"             TIMESTAMPTZ,
        CONSTRAINT "PK_rides" PRIMARY KEY ("id"),
        CONSTRAINT "FK_rides_client_id"
          FOREIGN KEY ("client_id") REFERENCES "clients"("id"),
        CONSTRAINT "FK_rides_driver_id"
          FOREIGN KEY ("driver_id") REFERENCES "drivers"("id"),
        CONSTRAINT "FK_rides_company_id"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
        CONSTRAINT "FK_rides_tariff_id"
          FOREIGN KEY ("tariff_id") REFERENCES "tariffs"("id")
      )
    `);

    // ── TABLE: expenses ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "expenses" (
        "id"           UUID           NOT NULL DEFAULT gen_random_uuid(),
        "driver_id"    UUID           NOT NULL,
        "type"         "expense_type" NOT NULL,
        "amount"       DECIMAL(10,2)  NOT NULL,
        "description"  VARCHAR(300),
        "expense_date" DATE           NOT NULL,
        "receipt_url"  VARCHAR(500),
        "created_at"   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_expenses" PRIMARY KEY ("id"),
        CONSTRAINT "FK_expenses_driver_id"
          FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE
      )
    `);

    // ── INDEXES ────────────────────────────────────────────────────────────
    await queryRunner.query(`CREATE INDEX "idx_users_phone" ON "users" ("phone")`);
    await queryRunner.query(`CREATE INDEX "idx_users_role" ON "users" ("role")`);
    await queryRunner.query(`CREATE INDEX "idx_companies_user" ON "companies" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "idx_drivers_user" ON "drivers" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "idx_drivers_company" ON "drivers" ("company_id")`);
    await queryRunner.query(`CREATE INDEX "idx_drivers_online" ON "drivers" ("is_online") WHERE "is_online" = true`);
    await queryRunner.query(`CREATE INDEX "idx_clients_user" ON "clients" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "idx_rides_client" ON "rides" ("client_id")`);
    await queryRunner.query(`CREATE INDEX "idx_rides_driver" ON "rides" ("driver_id")`);
    await queryRunner.query(`CREATE INDEX "idx_rides_company" ON "rides" ("company_id")`);
    await queryRunner.query(`CREATE INDEX "idx_rides_status" ON "rides" ("status")`);
    await queryRunner.query(`CREATE INDEX "idx_rides_created" ON "rides" ("created_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "idx_expenses_driver" ON "expenses" ("driver_id")`);
    await queryRunner.query(`CREATE INDEX "idx_expenses_date" ON "expenses" ("expense_date" DESC)`);
    await queryRunner.query(`CREATE INDEX "idx_company_subs_company" ON "company_subscriptions" ("company_id")`);
    await queryRunner.query(`CREATE INDEX "idx_tariffs_company" ON "tariffs" ("company_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tariffs_company"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_company_subs_company"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_expenses_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_expenses_driver"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_rides_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_rides_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_rides_company"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_rides_driver"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_rides_client"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_clients_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_drivers_online"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_drivers_company"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_drivers_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_companies_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_role"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_phone"`);

    // Drop tables in reverse FK order
    await queryRunner.query(`DROP TABLE IF EXISTS "expenses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rides"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tariffs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "company_subscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "clients"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "drivers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "companies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscription_plans"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);

    // Drop enums
    await queryRunner.query(`DROP TYPE IF EXISTS "expense_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "subscription_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payment_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "ride_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_role"`);
  }
}
