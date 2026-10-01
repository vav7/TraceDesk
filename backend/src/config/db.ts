import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Pool, PoolClient } from 'pg';
import { newDb } from 'pg-mem';
import { seedDatabase } from '../services/seedService';

// Load environment from the current working directory first, then from the
// backend folder (so `node backend/dist/app.js` from the repo root still
// picks up backend/.env). Already-set variables are never overwritten.
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

export type DatabaseMode = 'postgres' | 'memory';

export interface DatabaseInfo {
  mode: DatabaseMode;
  migrated: boolean;
  seeded: boolean;
  fellBackToMemory: boolean;
  error?: string;
}

const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'db', 'migrations');

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return raw !== 'false' && raw !== '0';
}

function createMemoryPool(): Pool {
  // Plain newDb(): the migration file creates explicit indexes for FK columns,
  // and pg-mem's autoCreateForeignKeyIndices option breaks ON CONFLICT matching.
  const memoryDb = newDb();
  const { Pool: MemoryPool } = memoryDb.adapters.createPg();
  return new MemoryPool() as unknown as Pool;
}

function createPostgresPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 8000,
  });
}

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const prefersMemory = process.env.DB_MODE === 'memory' || !hasDatabaseUrl;

export let dbMode: DatabaseMode = prefersMemory ? 'memory' : 'postgres';
export let pool: Pool = prefersMemory ? createMemoryPool() : createPostgresPool();

function switchToMemory(): void {
  dbMode = 'memory';
  pool = createMemoryPool();
}

/**
 * Applies every backend/db/migrations/*.sql file in filename order.
 * Safe to run repeatedly (all statements are idempotent) and works on
 * both real PostgreSQL and the in-memory pg-mem database.
 */
export async function runMigrations(target: Pick<Pool, 'query'> = pool): Promise<void> {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await target.query(sql);
  }
}

/** Seeds the deterministic demo data when the database has no integrations yet. */
export async function seedIfEmpty(target: Pool = pool): Promise<boolean> {
  const result = await target.query('SELECT COUNT(*)::int AS count FROM integrations');
  if (Number(result.rows[0]?.count ?? 0) > 0) return false;
  await seedDatabase(target);
  return true;
}

async function migratePostgresIfMissing(): Promise<boolean> {
  const result = await pool.query("SELECT to_regclass('public.integrations') AS table_ref");
  if (result.rows[0]?.table_ref) return false;
  await runMigrations();
  return true;
}

/**
 * Idempotent startup bootstrap:
 *  - memory mode   → create schema, seed demo data
 *  - postgres mode → verify connectivity, auto-migrate missing schema,
 *                    auto-seed empty databases, and fall back to memory
 *                    mode when the database is unreachable (unless DB_STRICT).
 */
export async function initDatabase(): Promise<DatabaseInfo> {
  if (dbMode === 'memory') {
    await runMigrations();
    const seeded = envFlag('AUTO_SEED', true) ? await seedIfEmpty() : false;
    return { mode: 'memory', migrated: true, seeded, fellBackToMemory: false };
  }

  try {
    await pool.query('SELECT 1');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (envFlag('DB_STRICT', false)) {
      throw new Error(
        `PostgreSQL is unreachable (${message}). Remove DATABASE_URL to run with the ` +
        'in-memory database, or set DB_STRICT=false to fall back automatically.',
      );
    }
    console.warn(`[db] PostgreSQL unreachable — falling back to the in-memory database (data will not persist). Reason: ${message}`);
    switchToMemory();
    await runMigrations();
    const seeded = envFlag('AUTO_SEED', true) ? await seedIfEmpty() : false;
    return { mode: 'memory', migrated: true, seeded, fellBackToMemory: true, error: message };
  }

  const migrated = envFlag('AUTO_MIGRATE', true) ? await migratePostgresIfMissing() : false;
  const seeded = envFlag('AUTO_SEED', true) ? await seedIfEmpty() : false;
  return { mode: 'postgres', migrated, seeded, fellBackToMemory: false };
}

export async function withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDatabase(): Promise<void> {
  try {
    await pool.end();
  } catch {
    // Ignore: the pool may already be closed (in-memory mode, tests, shutdown races).
  }
}
