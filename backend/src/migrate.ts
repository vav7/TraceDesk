import { pool, dbMode, runMigrations } from './config/db';

/**
 * CLI: `npm run migrate`
 * Applies backend/db/migrations/001_init.sql to the configured PostgreSQL
 * database using node-postgres — no `psql` binary required. When no
 * DATABASE_URL is set, migrations run automatically against the in-memory
 * database at startup, so this command is a no-op.
 */
async function main(): Promise<void> {
  if (dbMode === 'memory') {
    console.log('No DATABASE_URL configured — TraceDesk uses an in-memory database');
    console.log('that is migrated automatically at startup. Nothing to do.');
    return;
  }

  await runMigrations();
  console.log('Migrations applied to PostgreSQL.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
