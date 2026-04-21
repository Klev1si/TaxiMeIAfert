-- =============================================================================
-- TaxiApp — Full Database Schema
-- Step 9: Design all tables
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('super_admin', 'company', 'driver', 'client');

CREATE TYPE ride_status AS ENUM (
  'requested',
  'accepted',
  'driving_to_pickup',
  'in_progress',
  'completed',
  'cancelled'
);

CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');

CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'cancelled', 'trialing');

CREATE TYPE expense_type AS ENUM ('fuel', 'parking', 'maintenance', 'toll', 'other');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. USERS  (authentication base — one row per account)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  phone             VARCHAR(20)   UNIQUE NOT NULL,
  email             VARCHAR(255)  UNIQUE,
  password_hash     VARCHAR(255)  NOT NULL,
  role              user_role     NOT NULL,
  is_phone_verified BOOLEAN       NOT NULL DEFAULT false,
  is_active         BOOLEAN       NOT NULL DEFAULT true,
  refresh_token     VARCHAR(500),            -- hashed refresh token
  fcm_token         VARCHAR(500),            -- Firebase push token
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. COMPANIES  (taxi company managed by a company-role user)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE companies (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              VARCHAR(150)  NOT NULL,
  logo_url          VARCHAR(500),
  address           VARCHAR(300),
  city              VARCHAR(100),
  is_approved       BOOLEAN       NOT NULL DEFAULT false,   -- admin must approve
  approved_at       TIMESTAMPTZ,
  stripe_customer_id VARCHAR(100),                          -- Stripe billing
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DRIVERS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE drivers (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id        UUID          REFERENCES companies(id) ON DELETE SET NULL,
  first_name        VARCHAR(80)   NOT NULL,
  last_name         VARCHAR(80)   NOT NULL,
  photo_url         VARCHAR(500),
  license_number    VARCHAR(50)   NOT NULL,
  -- vehicle
  vehicle_make      VARCHAR(60)   NOT NULL,
  vehicle_model     VARCHAR(60)   NOT NULL,
  vehicle_year      SMALLINT      NOT NULL,
  vehicle_plate     VARCHAR(20)   NOT NULL,
  vehicle_color     VARCHAR(40),
  -- status
  is_approved       BOOLEAN       NOT NULL DEFAULT false,
  is_online         BOOLEAN       NOT NULL DEFAULT false,
  -- live location (also stored in Redis GEO for spatial queries)
  current_lat       DECIMAL(9,6),
  current_lng       DECIMAL(9,6),
  last_location_at  TIMESTAMPTZ,
  -- stats
  rating            DECIMAL(3,2)  NOT NULL DEFAULT 0.00,
  total_rides       INT           NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CLIENTS  (passengers)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE clients (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name        VARCHAR(80)   NOT NULL,
  last_name         VARCHAR(80)   NOT NULL,
  photo_url         VARCHAR(500),
  -- stats
  rating            DECIMAL(3,2)  NOT NULL DEFAULT 0.00,
  total_rides       INT           NOT NULL DEFAULT 0,
  stripe_customer_id VARCHAR(100),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. SUBSCRIPTION PLANS  (defined by super admin)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE subscription_plans (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(80)   NOT NULL,         -- e.g. "Starter", "Pro", "Enterprise"
  price_monthly     DECIMAL(10,2) NOT NULL,
  max_drivers       INT           NOT NULL,
  features          JSONB         NOT NULL DEFAULT '[]',
  stripe_price_id   VARCHAR(100),                   -- Stripe Price object ID
  is_active         BOOLEAN       NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. COMPANY SUBSCRIPTIONS  (which plan a company is on)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE company_subscriptions (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id               UUID          NOT NULL REFERENCES subscription_plans(id),
  stripe_subscription_id VARCHAR(100) UNIQUE,
  status                subscription_status NOT NULL DEFAULT 'trialing',
  current_period_start  TIMESTAMPTZ   NOT NULL,
  current_period_end    TIMESTAMPTZ   NOT NULL,
  cancelled_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. TARIFFS  (pricing rules per company — day/night, special zones, etc.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE tariffs (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              VARCHAR(80)   NOT NULL,          -- e.g. "Day", "Night", "Airport"
  base_fare         DECIMAL(10,2) NOT NULL,          -- fixed starting fee
  per_km_rate       DECIMAL(10,2) NOT NULL,          -- per kilometre
  per_minute_rate   DECIMAL(10,2) NOT NULL,          -- per minute in ride
  minimum_fare      DECIMAL(10,2) NOT NULL,
  is_night_tariff   BOOLEAN       NOT NULL DEFAULT false,
  night_start_hour  SMALLINT,                        -- 0–23, e.g. 22
  night_end_hour    SMALLINT,                        -- 0–23, e.g. 6
  is_active         BOOLEAN       NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RIDES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE rides (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               UUID          NOT NULL REFERENCES clients(id),
  driver_id               UUID          REFERENCES drivers(id),
  company_id              UUID          REFERENCES companies(id),
  tariff_id               UUID          REFERENCES tariffs(id),
  status                  ride_status   NOT NULL DEFAULT 'requested',
  -- pickup
  pickup_lat              DECIMAL(9,6)  NOT NULL,
  pickup_lng              DECIMAL(9,6)  NOT NULL,
  pickup_address          VARCHAR(300),
  -- dropoff (may be null until client picks destination)
  dropoff_lat             DECIMAL(9,6),
  dropoff_lng             DECIMAL(9,6),
  dropoff_address         VARCHAR(300),
  -- fare calculation
  distance_km             DECIMAL(8,3),
  duration_minutes        DECIMAL(8,2),
  base_fare               DECIMAL(10,2),
  distance_fare           DECIMAL(10,2),
  time_fare               DECIMAL(10,2),
  total_fare              DECIMAL(10,2),
  -- payment
  payment_status          payment_status NOT NULL DEFAULT 'pending',
  stripe_payment_intent_id VARCHAR(100),
  -- ratings (filled after ride completes)
  client_rating           SMALLINT CHECK (client_rating BETWEEN 1 AND 5),
  driver_rating           SMALLINT CHECK (driver_rating BETWEEN 1 AND 5),
  client_review           VARCHAR(500),
  driver_review           VARCHAR(500),
  -- cancellation
  cancel_reason           VARCHAR(300),
  cancelled_by            user_role,
  -- timestamps
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  accepted_at             TIMESTAMPTZ,
  pickup_arrived_at       TIMESTAMPTZ,
  started_at              TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. EXPENSES  (driver personal expense tracking)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE expenses (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id         UUID          NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  type              expense_type  NOT NULL,
  amount            DECIMAL(10,2) NOT NULL,
  description       VARCHAR(300),
  expense_date      DATE          NOT NULL,
  receipt_url       VARCHAR(500),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES  (for the queries we know will be frequent)
-- ─────────────────────────────────────────────────────────────────────────────

-- Auth lookups
CREATE INDEX idx_users_phone     ON users(phone);
CREATE INDEX idx_users_role      ON users(role);

-- Company lookups
CREATE INDEX idx_companies_user  ON companies(user_id);

-- Driver lookups
CREATE INDEX idx_drivers_user    ON drivers(user_id);
CREATE INDEX idx_drivers_company ON drivers(company_id);
CREATE INDEX idx_drivers_online  ON drivers(is_online) WHERE is_online = true;

-- Client lookups
CREATE INDEX idx_clients_user    ON clients(user_id);

-- Ride lookups (most queried table)
CREATE INDEX idx_rides_client    ON rides(client_id);
CREATE INDEX idx_rides_driver    ON rides(driver_id);
CREATE INDEX idx_rides_company   ON rides(company_id);
CREATE INDEX idx_rides_status    ON rides(status);
CREATE INDEX idx_rides_created   ON rides(created_at DESC);

-- Expense lookups
CREATE INDEX idx_expenses_driver ON expenses(driver_id);
CREATE INDEX idx_expenses_date   ON expenses(expense_date DESC);

-- Subscription lookups
CREATE INDEX idx_company_subs_company ON company_subscriptions(company_id);
CREATE INDEX idx_tariffs_company      ON tariffs(company_id);
