import request from 'supertest';
import app from '../../app';
import * as activationCodeService from '../../services/activationCodeService';

// Disable rate limiting in tests
jest.mock('express-rate-limit', () =>
  // Return a middleware that simply calls next()
  () => (_req: unknown, _res: unknown, next: () => void) => next()
);

// Mock the service layer so no real DB is needed
jest.mock('../../services/activationCodeService');

const mockValidateAndUseCode = activationCodeService.validateAndUseCode as jest.MockedFunction<
  typeof activationCodeService.validateAndUseCode
>;

describe('POST /api/session-key', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── 1. Valid code → 200 with sessionKey and remainingUses ───────────────
  it('returns 200 with sessionKey and remainingUses for a valid code', async () => {
    mockValidateAndUseCode.mockResolvedValue({
      success: true,
      sessionKey: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
      remainingUses: 7,
    });

    const res = await request(app)
      .post('/api/session-key')
      .send({ activationCode: 'ABCD-1234-EFGH-5678' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.sessionKey).toBe('string');
    expect(res.body.remainingUses).toBe(7);
  });

  // ─── 2. Missing activationCode → 400 ─────────────────────────────────────
  it('returns 400 when activationCode is missing', async () => {
    const res = await request(app).post('/api/session-key').send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when activationCode is not a string (number)', async () => {
    const res = await request(app).post('/api/session-key').send({ activationCode: 12345 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when activationCode is an empty string', async () => {
    const res = await request(app).post('/api/session-key').send({ activationCode: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // ─── 3. Code too short (stripped < 16 chars) → 400 ───────────────────────
  it('returns 400 when activation code is too short', async () => {
    const res = await request(app).post('/api/session-key').send({ activationCode: 'SHORT' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.reason).toBe('invalid_code');
  });

  // ─── 4. Non-existent code → 401 invalid_code ─────────────────────────────
  it('returns 401 with reason invalid_code for a non-existent code', async () => {
    mockValidateAndUseCode.mockResolvedValue({
      success: false,
      error: 'Invalid activation code',
      reason: 'invalid_code',
    });

    const res = await request(app)
      .post('/api/session-key')
      .send({ activationCode: 'XXXX1234YYYY5678' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.reason).toBe('invalid_code');
  });

  // ─── 5. Disabled code → 401 disabled ─────────────────────────────────────
  it('returns 401 with reason disabled for an inactive code', async () => {
    mockValidateAndUseCode.mockResolvedValue({
      success: false,
      error: 'Activation code is disabled',
      reason: 'disabled',
    });

    const res = await request(app)
      .post('/api/session-key')
      .send({ activationCode: 'ABCD1234EFGH5678' });

    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('disabled');
  });

  // ─── 6. Expired code → 401 expired ───────────────────────────────────────
  it('returns 401 with reason expired for an expired code', async () => {
    mockValidateAndUseCode.mockResolvedValue({
      success: false,
      error: 'Activation code has expired',
      reason: 'expired',
    });

    const res = await request(app)
      .post('/api/session-key')
      .send({ activationCode: 'ABCD1234EFGH5678' });

    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('expired');
  });

  // ─── 7. Exhausted code → 401 no_uses_left ────────────────────────────────
  it('returns 401 with reason no_uses_left for an exhausted code', async () => {
    mockValidateAndUseCode.mockResolvedValue({
      success: false,
      error: 'No remaining uses for this activation code',
      reason: 'no_uses_left',
    });

    const res = await request(app)
      .post('/api/session-key')
      .send({ activationCode: 'ABCD1234EFGH5678' });

    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('no_uses_left');
  });

  // ─── 8. Service throws → 500 ─────────────────────────────────────────────
  it('returns 500 when the service throws an unexpected error', async () => {
    mockValidateAndUseCode.mockRejectedValue(new Error('DB connection lost'));

    const res = await request(app)
      .post('/api/session-key')
      .send({ activationCode: 'ABCD1234EFGH5678' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  // ─── 9. Hyphenated code is accepted (stripped length still 16) ───────────
  it('accepts a hyphen-formatted code (XXXX-XXXX-XXXX-XXXX)', async () => {
    mockValidateAndUseCode.mockResolvedValue({
      success: true,
      sessionKey: 'a'.repeat(64),
      remainingUses: 5,
    });

    const res = await request(app)
      .post('/api/session-key')
      .send({ activationCode: 'ABCD-1234-EFGH-5678' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
