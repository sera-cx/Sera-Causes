import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_DATABASE_URL } from '../vitest.config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Creates (or resets) the sera_causes_test schema from prisma/schema.prisma. */
export default function setup(): void {
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'push', '--force-reset', '--skip-generate', '--accept-data-loss'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
