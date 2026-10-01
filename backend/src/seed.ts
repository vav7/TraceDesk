import { pool, dbMode, initDatabase } from './config/db';
import { seedDatabase } from './services/seedService';

/**
 * CLI: `npm run seed`
 * Ensures the schema exists and (re)applies the deterministic demo dataset
 * to the configured PostgreSQL database. When no DATABASE_URL is set, the
 * app runs on an in-memory database that is migrated and seeded
 * automatically at startup, so this command is a no-op.
 */
async function main(): Promise<void> {
  if (dbMode === 'memory') {
    console.log('No DATABASE_URL configured — TraceDesk uses an in-memory database');
    console.log('that is migrated and seeded automatically at startup. Nothing to do.');
    console.log('Set DATABASE_URL in backend/.env to seed a persistent PostgreSQL database.');
    return;
  }

  await initDatabase(); // verifies connectivity and applies missing migrations
  await seedDatabase(pool); // idempotent demo dataset
  console.log('Seed data inserted or verified.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
