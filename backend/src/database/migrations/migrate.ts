import fs from 'fs';
import path from 'path';
import { query } from '../index';

async function runMigrations(): Promise<void> {
  const migrationsDir = path.resolve(__dirname);

  const sqlFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of sqlFiles) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8').trim();

    if (!sql) {
      console.log(`[migrate] Skipped (empty): ${file}`);
      continue;
    }

    await query(sql);
    console.log(`[migrate] Executed: ${file}`);
  }

  console.log('[migrate] All migrations completed.');
}

runMigrations().catch((err) => {
  console.error('[migrate] Migration failed:', err);
  process.exit(1);
});
