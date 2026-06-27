import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Subscriptions overhaul:
 *  - subscription_plans: add billing_period enum; rename price_monthly -> price;
 *    drop stripe_price_id
 *  - driver_subscriptions / company_subscriptions: add payment_method, paysera_order_id,
 *    paid_by_admin_id, paid_at, payment_reference; drop stripe_subscription_id
 *  - new subscription_notifications dedupe table
 *
 * Existing plans are wiped (user opted not to migrate the legacy schema).
 */
export class SubscriptionsOverhaul1779100000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    // Wipe legacy subscription rows first (FK chain)
    await runner.query(`DELETE FROM driver_subscriptions`);
    await runner.query(`DELETE FROM company_subscriptions`);
    await runner.query(`DELETE FROM subscription_plans`);

    // ── Enums ────────────────────────────────────────────────────────────────
    await runner.query(`
      DO $$ BEGIN
        CREATE TYPE billing_period_enum AS ENUM ('monthly', 'quarterly', 'yearly');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await runner.query(`
      DO $$ BEGIN
        CREATE TYPE payment_method_enum AS ENUM ('card', 'cash');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await runner.query(`
      DO $$ BEGIN
        CREATE TYPE subscription_notification_type_enum AS ENUM (
          'reminder_7d', 'reminder_3d', 'reminder_1d', 'expired', 'grace_end_blocked'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    // ── subscription_plans ───────────────────────────────────────────────────
    await runner.query(`
      ALTER TABLE subscription_plans
        DROP COLUMN IF EXISTS stripe_price_id
    `);
    await runner.query(`
      ALTER TABLE subscription_plans
        RENAME COLUMN price_monthly TO price
    `);
    await runner.query(`
      ALTER TABLE subscription_plans
        ADD COLUMN IF NOT EXISTS billing_period billing_period_enum
        NOT NULL DEFAULT 'monthly'
    `);
    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_plans_audience_period_active
        ON subscription_plans (target_audience, billing_period, is_active)
    `);

    // ── driver_subscriptions ─────────────────────────────────────────────────
    await runner.query(`
      ALTER TABLE driver_subscriptions
        DROP COLUMN IF EXISTS stripe_subscription_id
    `);
    await runner.query(`
      ALTER TABLE driver_subscriptions
        ADD COLUMN IF NOT EXISTS payment_method payment_method_enum NOT NULL DEFAULT 'card',
        ADD COLUMN IF NOT EXISTS paysera_order_id   VARCHAR(100)  NULL,
        ADD COLUMN IF NOT EXISTS paid_by_admin_id   VARCHAR       NULL,
        ADD COLUMN IF NOT EXISTS paid_at            TIMESTAMPTZ   NULL,
        ADD COLUMN IF NOT EXISTS payment_reference  VARCHAR(200)  NULL
    `);
    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_driver_subs_period_end
        ON driver_subscriptions (current_period_end)
    `);
    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_driver_subs_status
        ON driver_subscriptions (status)
    `);

    // ── company_subscriptions ────────────────────────────────────────────────
    await runner.query(`
      ALTER TABLE company_subscriptions
        DROP COLUMN IF EXISTS stripe_subscription_id
    `);
    await runner.query(`
      ALTER TABLE company_subscriptions
        ADD COLUMN IF NOT EXISTS payment_method payment_method_enum NOT NULL DEFAULT 'card',
        ADD COLUMN IF NOT EXISTS paysera_order_id   VARCHAR(100)  NULL,
        ADD COLUMN IF NOT EXISTS paid_by_admin_id   VARCHAR       NULL,
        ADD COLUMN IF NOT EXISTS paid_at            TIMESTAMPTZ   NULL,
        ADD COLUMN IF NOT EXISTS payment_reference  VARCHAR(200)  NULL
    `);
    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_company_subs_period_end
        ON company_subscriptions (current_period_end)
    `);
    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_company_subs_status
        ON company_subscriptions (status)
    `);

    // ── subscription_notifications (dedupe ledger) ───────────────────────────
    await runner.query(`
      CREATE TABLE IF NOT EXISTS subscription_notifications (
        id                UUID                                  PRIMARY KEY DEFAULT gen_random_uuid(),
        subscription_id   UUID                                  NOT NULL,
        subscription_kind VARCHAR(20)                           NOT NULL,
        type              subscription_notification_type_enum   NOT NULL,
        period_end        TIMESTAMPTZ                           NOT NULL,
        sent_at           TIMESTAMPTZ                           NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_sub_notification UNIQUE (subscription_id, period_end, type)
      )
    `);
    await runner.query(`
      CREATE INDEX IF NOT EXISTS idx_sub_notifications_sub
        ON subscription_notifications (subscription_id)
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS subscription_notifications`);
    await runner.query(`DROP TYPE IF EXISTS subscription_notification_type_enum`);

    await runner.query(`DROP INDEX IF EXISTS idx_company_subs_status`);
    await runner.query(`DROP INDEX IF EXISTS idx_company_subs_period_end`);
    await runner.query(`
      ALTER TABLE company_subscriptions
        DROP COLUMN IF EXISTS payment_reference,
        DROP COLUMN IF EXISTS paid_at,
        DROP COLUMN IF EXISTS paid_by_admin_id,
        DROP COLUMN IF EXISTS paysera_order_id,
        DROP COLUMN IF EXISTS payment_method,
        ADD  COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100) NULL UNIQUE
    `);

    await runner.query(`DROP INDEX IF EXISTS idx_driver_subs_status`);
    await runner.query(`DROP INDEX IF EXISTS idx_driver_subs_period_end`);
    await runner.query(`
      ALTER TABLE driver_subscriptions
        DROP COLUMN IF EXISTS payment_reference,
        DROP COLUMN IF EXISTS paid_at,
        DROP COLUMN IF EXISTS paid_by_admin_id,
        DROP COLUMN IF EXISTS paysera_order_id,
        DROP COLUMN IF EXISTS payment_method,
        ADD  COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100) NULL UNIQUE
    `);

    await runner.query(`DROP INDEX IF EXISTS idx_plans_audience_period_active`);
    await runner.query(`
      ALTER TABLE subscription_plans
        DROP COLUMN IF EXISTS billing_period
    `);
    await runner.query(`
      ALTER TABLE subscription_plans
        RENAME COLUMN price TO price_monthly
    `);
    await runner.query(`
      ALTER TABLE subscription_plans
        ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(100) NULL
    `);

    await runner.query(`DROP TYPE IF EXISTS payment_method_enum`);
    await runner.query(`DROP TYPE IF EXISTS billing_period_enum`);
  }
}
