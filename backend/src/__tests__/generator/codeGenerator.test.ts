import { generateRandomCode } from '../../generator/codeGenerator';

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const FORBIDDEN = ['I', 'O', '0', '1'];
const FORMAT_REGEX = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

describe('generateRandomCode()', () => {
  it('should return a string of total length 19 (16 alphanumeric + 3 hyphens)', () => {
    const code = generateRandomCode();
    expect(code).toHaveLength(19);
  });

  it('should match the XXXX-XXXX-XXXX-XXXX format', () => {
    const code = generateRandomCode();
    expect(code).toMatch(FORMAT_REGEX);
  });

  it('should place hyphens at positions 4, 9, and 14 (0-indexed)', () => {
    const code = generateRandomCode();
    expect(code[4]).toBe('-');
    expect(code[9]).toBe('-');
    expect(code[14]).toBe('-');
  });

  it('should only use characters from the allowed charset', () => {
    const code = generateRandomCode();
    const alphanumericPart = code.replace(/-/g, '');
    for (const char of alphanumericPart) {
      expect(CHARSET).toContain(char);
    }
  });

  it('should not contain forbidden characters I, O, 0, 1', () => {
    const code = generateRandomCode();
    for (const forbidden of FORBIDDEN) {
      expect(code).not.toContain(forbidden);
    }
  });

  it('should produce 16 alphanumeric characters (excluding hyphens)', () => {
    const code = generateRandomCode();
    const alphanumericPart = code.replace(/-/g, '');
    expect(alphanumericPart).toHaveLength(16);
  });

  it('should return different codes on multiple calls (randomness)', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRandomCode()));
    // With a 32-character charset and 16 positions, collisions are astronomically unlikely
    expect(codes.size).toBeGreaterThan(1);
  });

  it('should produce four groups of 4 characters separated by hyphens', () => {
    const code = generateRandomCode();
    const parts = code.split('-');
    expect(parts).toHaveLength(4);
    for (const part of parts) {
      expect(part).toHaveLength(4);
    }
  });

  it('should be consistent across 100 generated codes', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRandomCode();
      expect(code).toHaveLength(19);
      expect(code).toMatch(FORMAT_REGEX);
      const alphanumericPart = code.replace(/-/g, '');
      for (const char of alphanumericPart) {
        expect(CHARSET).toContain(char);
      }
    }
  });
});

import { createActivationCode } from '../../generator/codeGenerator';

// Mock the database module
jest.mock('../../database', () => ({
  query: jest.fn(),
}));

import { query } from '../../database';
const mockQuery = query as jest.MockedFunction<typeof query>;

const FORMAT_REGEX_FULL = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

describe('createActivationCode()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a code matching XXXX-XXXX-XXXX-XXXX format', async () => {
    // SELECT returns empty (no collision), INSERT succeeds
    mockQuery
      .mockResolvedValueOnce([])          // SELECT: no existing code
      .mockResolvedValueOnce({ affectedRows: 1 } as any); // INSERT

    const code = await createActivationCode(10, 30);
    expect(code).toMatch(FORMAT_REGEX_FULL);
    expect(code).toHaveLength(19);
  });

  it('should INSERT with correct values: maxUses, usedCount=0, isActive=true', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ affectedRows: 1 } as any);

    await createActivationCode(5, 7);

    const insertCall = mockQuery.mock.calls[1];
    const sql = insertCall[0] as string;
    const params = insertCall[1] as any[];

    expect(sql).toMatch(/INSERT INTO/i);
    expect(params[1]).toBe(5);     // maxUses
    expect(params[2]).toBe(0);     // usedCount = 0
    expect(params[4]).toBe(true);  // isActive = true
  });

  it('should calculate expiryDate = now + expiryDays * 86400000ms', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ affectedRows: 1 } as any);

    const before = Date.now();
    await createActivationCode(1, 30);
    const after = Date.now();

    const insertCall = mockQuery.mock.calls[1];
    const params = insertCall[1] as any[];
    const expiryDate = new Date(params[3]).getTime(); // expiryDate param
    const createdAt = new Date(params[5]).getTime();  // createdAt param

    const expectedExpiry = createdAt + 30 * 86400000;
    // Allow ±1000ms tolerance
    expect(Math.abs(expiryDate - expectedExpiry)).toBeLessThanOrEqual(1000);
    expect(createdAt).toBeGreaterThanOrEqual(before);
    expect(createdAt).toBeLessThanOrEqual(after);
  });

  it('should call SELECT before INSERT to check uniqueness', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ affectedRows: 1 } as any);

    await createActivationCode(3, 14);

    expect(mockQuery).toHaveBeenCalledTimes(2);

    const selectCall = mockQuery.mock.calls[0];
    const insertCall = mockQuery.mock.calls[1];

    expect((selectCall[0] as string)).toMatch(/SELECT/i);
    expect((selectCall[0] as string)).toMatch(/activation_codes/i);
    expect((insertCall[0] as string)).toMatch(/INSERT/i);
  });

  it('should retry when first attempt has a collision', async () => {
    mockQuery
      .mockResolvedValueOnce([{ code: 'AAAA-BBBB-CCCC-DDDD' }] as any)  // 1st SELECT: collision
      .mockResolvedValueOnce([])                                           // 2nd SELECT: unique
      .mockResolvedValueOnce({ affectedRows: 1 } as any);                 // INSERT

    const code = await createActivationCode(2, 10);

    expect(code).toMatch(FORMAT_REGEX_FULL);
    // 2 SELECTs + 1 INSERT = 3 total calls
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it('should throw error after 10 consecutive collisions', async () => {
    // All 10 SELECT attempts return a collision
    for (let i = 0; i < 10; i++) {
      mockQuery.mockResolvedValueOnce([{ code: 'XXXX-XXXX-XXXX-XXXX' }] as any);
    }

    await expect(createActivationCode(1, 30)).rejects.toThrow(
      /failed to generate unique activation code after 10 attempts/i
    );

    // Exactly 10 SELECT calls, no INSERT
    expect(mockQuery).toHaveBeenCalledTimes(10);
    const callSqls = mockQuery.mock.calls.map((c) => (c[0] as string).toUpperCase());
    expect(callSqls.every((sql) => sql.includes('SELECT'))).toBe(true);
  });
});
