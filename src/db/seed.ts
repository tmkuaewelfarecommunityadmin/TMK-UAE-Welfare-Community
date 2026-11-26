import 'dotenv/config';
import { pool } from './index.ts';
import { ensureReferenceData } from '../server/seed.ts';

async function main() {
  const forceAdminPasswordReset = process.argv.includes('--force-password');
  await ensureReferenceData({ forceAdminPasswordReset });
  console.log('Database reference data and default admin user verified.');
}

main()
  .catch((err) => {
    console.error('Database seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
