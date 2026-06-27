const { Client } = require('pg');

const c = new Client({
  host: '127.0.0.1',
  port: 5433,
  user: 'taxiapp',
  password: 'taxiapp_dev_password',
  database: 'taxiapp_db',
});

/**
 * Suggested defaults — admin can edit prices freely in the dashboard.
 * Companies use flat pricing (covered up to maxDrivers cap, edit if needed).
 */
const plans = [
  // ── Drivers (solo) ──────────────────────────────────────────────────────────
  { audience: 'driver',  name: 'Driver Monthly',  price:  15.00, period: 'monthly',   maxDrivers: 1,
    features: ['Unlimited rides', 'In-app support'] },
  { audience: 'driver',  name: 'Driver 3-Month',  price:  40.00, period: 'quarterly', maxDrivers: 1,
    features: ['Unlimited rides', 'In-app support', '~11% discount vs monthly'] },
  { audience: 'driver',  name: 'Driver Yearly',   price: 144.00, period: 'yearly',    maxDrivers: 1,
    features: ['Unlimited rides', 'In-app support', '20% discount vs monthly'] },

  // ── Companies ───────────────────────────────────────────────────────────────
  { audience: 'company', name: 'Company Monthly', price:  99.00, period: 'monthly',   maxDrivers: 100,
    features: ['Fleet dashboard', 'Priority support'] },
  { audience: 'company', name: 'Company 3-Month', price: 270.00, period: 'quarterly', maxDrivers: 100,
    features: ['Fleet dashboard', 'Priority support', '~9% discount vs monthly'] },
  { audience: 'company', name: 'Company Yearly',  price: 960.00, period: 'yearly',    maxDrivers: 100,
    features: ['Fleet dashboard', 'Priority support', '~19% discount vs monthly'] },
];

async function run() {
  await c.connect();
  console.log('Connected.');

  await c.query(`DELETE FROM subscription_plans`);
  console.log('Cleared existing plans.\n');

  for (const p of plans) {
    await c.query(
      `INSERT INTO subscription_plans
         (id, name, price, billing_period, max_drivers, features, target_audience, is_active)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, $6, true)`,
      [p.name, p.price, p.period, p.maxDrivers, JSON.stringify(p.features), p.audience],
    );
    console.log(`  ✓ [${p.audience.padEnd(7)}] ${p.name.padEnd(18)} €${p.price.toFixed(2)} / ${p.period}`);
  }

  console.log('\nDone! Plans seeded.');
  await c.end();
}

run().catch(err => {
  console.error('Error:', err.message);
  c.end();
});
