import { validateAndUseCode, logUsage } from '../../services/activationCodeService';
import { query } from '../../database';

// Mock the database module
jest.mock('../../database', () => ({
  query: jest.fn(),
}));

const mockQuery = query as jest.MockedFunction<typeof query>;

// Helper to build a base activation code row
function makeCode(overrides: Partial<Record<string, unknown>> = {}) {
  return [
    {
      id: 1,
      code: 'ABCD1234EFGH5678',
      maxUses: 10,
      usedCount: 3,
      expiryDate: new Date(Date.now() + 86_400_000).toISOString(), // +1 day
      isActive: true,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      ...overrides,
    },
  ];
}

// ResultSetHeader-like mock
function makeUpdateResult(affectedRows: number) {
  return { affectedRows, insertId: 0, fieldCount: 0, serverStatus: 0, warningCount: 0, changedRows: 0, info: '' };
}

// Usage log insert returns a ResultSetHeader
function makeInsertResult() {
  return makeUpdateResult(1);
}

describe('validateAndUseCode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── 1. Valid code returns sessionKey and remainingUses ───────────────────
  it('returns sessionKey and correct remainingUses for a valid code', async () => {
    const code = makeCode({ usedCount: 3, maxUses: 10 });
    mockQuery
      .mockResolvedValueOnce(code as never)          // SELECT
      .mockResolvedValueOnce(makeUpdateResult(1) as never) // UPDATE
      .mockResolvedValueOnce(makeInsertResult() as never); // INSERT usage_log

    const result = await validateAndUseCode('ABCD1234EFGH5678', '127.0.0.1', 'TestAgent/1.0');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.sessionKey).toBe('string');
      expect(result.sessionKey).toHaveLength(64); // 32 bytes → 64 hex chars
      expect(result.remainingUses).toBe(6); // maxUses(10) - usedCount(3) - 1
    }
  });

  // ─── 2. Non-existent code → 401 invalid_code ─────────────────────────────
  it('returns invalid_code when the activation code does not exist', async () => {
    mockQuery
      .mockResolvedValueOnce([] as never)            // SELECT returns empty
      .mockResolvedValueOnce(makeInsertResult() as never); // INSERT usage_log

    const result = await validateAndUseCode('NOSUCHCODE000000', '127.0.0.1', 'TestAgent/1.0');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('invalid_code');
    }
  });

  // ─── 3. Inactive code → 401 disabled ─────────────────────────────────────
  it('returns disabled when isActive is false', async () => {
    mockQuery
      .mockResolvedValueOnce(makeCode({ isActive: false }) as never)
      .mockResolvedValueOnce(makeInsertResult() as never);

    const result = await validateAndUseCode('ABCD1234EFGH5678', '127.0.0.1', 'TestAgent/1.0');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('disabled');
    }
  });

  // ─── 4. Expired code → 401 expired ───────────────────────────────────────
  it('returns expired when expiryDate is in the past', async () => {
    const pastDate = new Date(Date.now() - 86_400_000).toISOString(); // -1 day
    mockQuery
      .mockResolvedValueOnce(makeCode({ expiryDate: pastDate }) as never)
      .mockResolvedValueOnce(makeInsertResult() as never);

    const result = await validateAndUseCode('ABCD1234EFGH5678', '127.0.0.1', 'TestAgent/1.0');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('expired');
    }
  });

  // ─── 5. Exhausted code → 401 no_uses_left ────────────────────────────────
  it('returns no_uses_left when usedCount >= maxUses', async () => {
    mockQuery
      .mockResolvedValueOnce(makeCode({ usedCount: 10, maxUses: 10 }) as never)
      .mockResolvedValueOnce(makeInsertResult() as never);

    const result = await validateAndUseCode('ABCD1234EFGH5678', '127.0.0.1', 'TestAgent/1.0');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('no_uses_left');
    }
  });

  it('returns no_uses_left when usedCount exceeds maxUses', async () => {
    mockQuery
      .mockResolvedValueOnce(makeCode({ usedCount: 15, maxUses: 10 }) as never)
      .mockResolvedValueOnce(makeInsertResult() as never);

    const result = await validateAndUseCode('ABCD1234EFGH5678', '127.0.0.1', 'TestAgent/1.0');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('no_uses_left');
    }
  });

  // ─── 6. Atomic increment: race condition (UPDATE affectedRows=0) ──────────
  it('returns no_uses_left when UPDATE affectedRows=0 (race condition)', async () => {
    mockQuery
      .mockResolvedValueOnce(makeCode({ usedCount: 9, maxUses: 10 }) as never) // SELECT: still one left
      .mockResolvedValueOnce(makeUpdateResult(0) as never)                      // UPDATE: someone else got it
      .mockResolvedValueOnce(makeInsertResult() as never);                      // INSERT usage_log

    const result = await validateAndUseCode('ABCD1234EFGH5678', '127.0.0.1', 'TestAgent/1.0');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('no_uses_left');
    }
  });

  // ─── 7. lastUsedAt is updated (UPDATE query carries the timestamp) ────────
  it('passes a lastUsedAt timestamp in the UPDATE query', async () => {
    const code = makeCode({ usedCount: 2, maxUses: 5 });
    mockQuery
      .mockResolvedValueOnce(code as never)
      .mockResolvedValueOnce(makeUpdateResult(1) as never)
      .mockResolvedValueOnce(makeInsertResult() as never);

    const before = Date.now();
    await validateAndUseCode('ABCD1234EFGH5678', '127.0.0.1', 'TestAgent/1.0');
    const after = Date.now();

    // The second call is the UPDATE; its first param is the ISO timestamp
    const updateCall = mockQuery.mock.calls[1];
    const passedTimestamp = updateCall[1]![0] as string;
    const ts = new Date(passedTimestamp).getTime();

    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  // ─── 8. Usage log is written on every path ────────────────────────────────
  it('writes a usage log on successful validation', async () => {
    mockQuery
      .mockResolvedValueOnce(makeCode() as never)
      .mockResolvedValueOnce(makeUpdateResult(1) as never)
      .mockResolvedValueOnce(makeInsertResult() as never);

    await validateAndUseCode('ABCD1234EFGH5678', '1.2.3.4', 'Mozilla/5.0');

    // Third call is the INSERT into usage_logs
    const logCall = mockQuery.mock.calls[2];
    expect(logCall[1]).toContain('ABCD1234EFGH5678');
    expect(logCall[1]).toContain('1.2.3.4');
    expect(logCall[1]).toContain('Mozilla/5.0');
    expect(logCall[1]).toContain(true); // success = true
  });

  it('writes a usage log on invalid code', async () => {
    mockQuery
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce(makeInsertResult() as never);

    await validateAndUseCode('BADCODE000000000', '1.2.3.4', 'Mozilla/5.0');

    const logCall = mockQuery.mock.calls[1];
    expect(logCall[1]).toContain(false);        // success = false
    expect(logCall[1]).toContain('invalid_code'); // errorReason
  });

  // ─── 9. remainingUses boundary: last use ─────────────────────────────────
  it('returns remainingUses=0 when consuming the last available use', async () => {
    mockQuery
      .mockResolvedValueOnce(makeCode({ usedCount: 4, maxUses: 5 }) as never)
      .mockResolvedValueOnce(makeUpdateResult(1) as never)
      .mockResolvedValueOnce(makeInsertResult() as never);

    const result = await validateAndUseCode('ABCD1234EFGH5678', '127.0.0.1', 'TestAgent/1.0');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.remainingUses).toBe(0);
    }
  });

  // ─── 10. Validation order: isActive checked before expiry ────────────────
  it('reports disabled rather than expired when code is both inactive and expired', async () => {
    const pastDate = new Date(Date.now() - 86_400_000).toISOString();
    mockQuery
      .mockResolvedValueOnce(makeCode({ isActive: false, expiryDate: pastDate }) as never)
      .mockResolvedValueOnce(makeInsertResult() as never);

    const result = await validateAndUseCode('ABCD1234EFGH5678', '127.0.0.1', 'TestAgent/1.0');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('disabled');
    }
  });
});

describe('logUsage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inserts a usage log row with success=true and no errorReason', async () => {
    mockQuery.mockResolvedValueOnce(makeInsertResult() as never);

    await logUsage({ activationCode: 'TEST0000', ipAddress: '1.1.1.1', userAgent: 'UA', success: true });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO');
    expect(params).toEqual(['TEST0000', '1.1.1.1', 'UA', true, null]);
  });

  it('inserts a usage log row with success=false and an errorReason', async () => {
    mockQuery.mockResolvedValueOnce(makeInsertResult() as never);

    await logUsage({
      activationCode: 'TEST0000',
      ipAddress: '1.1.1.1',
      userAgent: 'UA',
      success: false,
      errorReason: 'expired',
    });

    const [, params] = mockQuery.mock.calls[0];
    expect(params).toEqual(['TEST0000', '1.1.1.1', 'UA', false, 'expired']);
  });
});
