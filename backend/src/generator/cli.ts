/**
 * CLI interface for activation code generator tool.
 * Usage:
 *   ts-node src/generator/cli.ts create --maxUses 100 --expiryDays 30
 *   ts-node src/generator/cli.ts list [--active] [--inactive] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *   ts-node src/generator/cli.ts disable --code XXXX-XXXX-XXXX-XXXX
 *   ts-node src/generator/cli.ts export --format csv
 *   ts-node src/generator/cli.ts export --format json
 */

import 'dotenv/config';
import {
  createActivationCode,
  disableCode,
  exportCodes,
  listActivationCodes,
} from './codeGenerator';

// ── Argument parsing (5.11) ────────────────────────────────────────────────

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

// ── Commands ───────────────────────────────────────────────────────────────

async function cmdCreate(args: string[]): Promise<void> {
  const expiryDaysStr = getArg(args, '--expiryDays');
  const sessionKeysStr = getArg(args, '--sessionKeys');
  const sessionKeysFile = getArg(args, '--sessionKeysFile');
  const maxUsesStr = getArg(args, '--maxUses');

  if (!expiryDaysStr) {
    console.error('Usage: create --expiryDays <number> [--sessionKeys sk1,sk2,...] [--sessionKeysFile path] [--maxUses <number>]');
    process.exit(1);
  }

  const expiryDays = parseInt(expiryDaysStr, 10);
  if (isNaN(expiryDays) || expiryDays <= 0) {
    console.error('--expiryDays must be a positive integer');
    process.exit(1);
  }

  // Collect session keys
  let sessionKeys: string[] = [];
  if (sessionKeysFile) {
    const fs = await import('fs');
    const content = fs.readFileSync(sessionKeysFile, 'utf-8');
    sessionKeys = content.split('\n').map(s => s.trim()).filter(Boolean);
  } else if (sessionKeysStr) {
    sessionKeys = sessionKeysStr.split(',').map(s => s.trim()).filter(Boolean);
  }

  // Determine maxUses
  let maxUses = 1;
  if (sessionKeys.length > 0) {
    maxUses = sessionKeys.length;
  } else if (maxUsesStr) {
    maxUses = parseInt(maxUsesStr, 10);
    if (isNaN(maxUses) || maxUses <= 0) {
      console.error('--maxUses must be a positive integer');
      process.exit(1);
    }
  }

  const code = await createActivationCode(maxUses, expiryDays, sessionKeys.length > 0 ? sessionKeys : undefined);
  console.log(`Created: ${code}  maxUses=${maxUses}  expiryDays=${expiryDays}${sessionKeys.length > 0 ? `  sessionKeys=${sessionKeys.length}` : ''}`);
}

async function cmdList(args: string[]): Promise<void> {
  const filters: Parameters<typeof listActivationCodes>[0] = {};

  if (hasFlag(args, '--active')) filters.isActive = true;
  if (hasFlag(args, '--inactive')) filters.isActive = false;

  const from = getArg(args, '--from');
  const to = getArg(args, '--to');
  if (from) filters.expiryDateFrom = from;
  if (to) filters.expiryDateTo = to;

  const codes = await listActivationCodes(filters);

  if (codes.length === 0) {
    console.log('No activation codes found.');
    return;
  }

  console.log(`Found ${codes.length} code(s):\n`);
  for (const c of codes) {
    console.log(
      `  ${c.code}  maxUses=${c.maxUses}  used=${c.usedCount}  active=${c.isActive}  expires=${c.expiryDate}`
    );
  }
}

async function cmdDisable(args: string[]): Promise<void> {
  const code = getArg(args, '--code');
  if (!code) {
    console.error('Usage: disable --code XXXX-XXXX-XXXX-XXXX');
    process.exit(1);
  }
  await disableCode(code);
  console.log(`Disabled: ${code}`);
}

async function cmdExport(args: string[]): Promise<void> {
  const format = getArg(args, '--format') as 'csv' | 'json' | undefined;
  if (!format || (format !== 'csv' && format !== 'json')) {
    console.error('Usage: export --format csv|json');
    process.exit(1);
  }
  const output = await exportCodes(format);
  console.log(output);
}

// ── Entry point ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  switch (command) {
    case 'create':
      await cmdCreate(rest);
      break;
    case 'list':
      await cmdList(rest);
      break;
    case 'disable':
      await cmdDisable(rest);
      break;
    case 'export':
      await cmdExport(rest);
      break;
    default:
      console.error(
        'Unknown command. Available commands: create, list, disable, export'
      );
      process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
