const { Client } = require('pg');

const c = new Client({
  host: '127.0.0.1',
  port: 5433,
  user: 'taxiapp',
  password: 'taxiapp_dev_password',
  database: 'taxiapp_db',
});

const plans = [
  {
    name: 'Starter',
    price: 29.99,
    maxDrivers: 5,
    features: ['Priority support', 'Basic analytics'],
  },
  {
    name: 'Professional',
    price: 79.99,
    maxDrivers: 25,
    features: ['Priority support', 'Advanced analytics', 'Custom tariffs'],
  },
  {
    name: 'Enterprise',
    price: 199.99,
    maxDrivers: 100,
    features: ['Dedicated support', 'Full analytics', 'Custom tariffs', 'White-label'],
  },
];

async function run() {
  await c.connect();
  console.log('Connected.');

  for (const p of plans) {
    await c.query(
      `INSERT INTO subscription_plans
         (id, name, price_monthly, max_drivers, features, stripe_price_id, is_active)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4::jsonb, NULL, true)`,
      [p.name, p.price, p.maxDrivers, JSON.stringify(p.features)],
    );
    console.log(`  ✓ ${p.name} — $${p.price}/mo, up to ${p.maxDrivers} drivers`);
  }

  console.log('\nDone! Plans seeded.');
  await c.end();
}

run().catch(err => {
  console.error('Error:', err.message);
  c.end();
});
