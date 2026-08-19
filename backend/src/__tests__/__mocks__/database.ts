/**
 * Shared database mock helper for Jest tests.
 *
 * Usage in test files:
 *   jest.mock('../../database', () => createMockDatabase());
 *   import { mockQuery, makeActivationCodeRow, makeUpdateResult } from '../__mocks__/database';
 */

import { ResultSetHeader } from 'mysql2/promise';
import type { ActivationCode } from '../../models/ActivationCode';

/** Typed Jest mock for the `query` function exported by `backend/src/database/index.ts` */
export const mockQuery: jest.Mock = jest.fn();

/**
 * Returns the mock module shape expected by `jest.mock('../../database', ...)`.
 * Pass the return value directly as the factory function result.
 *
 * @example
 * jest.mock('../../database', () => createMockDatabase());
 */
export function createMockDatabase(): { query: jest.Mock } {
  return { query: mockQuery };
}

// ---------------------------------------------------------------------------
// Row / result helpers
// ---------------------------------------------------------------------------

/**
 * Builds a mock `activation_codes` table row wrapped in an array (as returned
 * by a SELECT query). Accepts partial overrides for any field.
 */
export function makeActivationCodeRow(
  overrides: Partial<ActivationCode> = {}
): ActivationCode[] {
  const defaults: ActivationCode = {
    // mysql2 RowDataPacket internals (constructor-like symbol properties are
    // not enumerable so we cast via `as unknown`)
    id: 1,
    code: 'ABCD-EFGH-JKLM-NPQR',
    maxUses: 10,
    usedCount: 0,
    expiryDate: new Date(Date.now() + 86_400_000).toISOString(), // +1 day
    isActive: true,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    ...overrides,
  } as unknown as ActivationCode;

  return [defaults];
}

/**
 * Returns a minimal `ResultSetHeader`-like object for UPDATE/DELETE statements.
 *
 * @param affectedRows - Number of rows affected by the query
 */
export function makeUpdateResult(affectedRows: number): Partial<ResultSetHeader> {
  return {
    affectedRows,
    insertId: 0,
    fieldCount: 0,
    serverStatus: 0,
    warningStatus: 0,
    changedRows: 0,
    info: '',
  };
}

/**
 * Returns a `ResultSetHeader`-like object representing a successful single-row
 * INSERT (affectedRows = 1, insertId = 1).
 */
export function makeInsertResult(): Partial<ResultSetHeader> {
  return makeUpdateResult(1);
}
