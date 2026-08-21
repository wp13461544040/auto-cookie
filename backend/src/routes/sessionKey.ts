import { Router, Request, Response } from 'express';
import { validateAndUseCode } from '../services/activationCodeService';

const router = Router();

/**
 * POST /api/session-key
 * Validates an activation code and returns a new sessionKey.
 *
 * Body: { activationCode: string }
 * Success: 200 { success: true, sessionKey: string, remainingUses: number }
 * Failure: 400/401 { success: false, error: string, reason: string }
 */
router.post('/session-key', async (req: Request, res: Response): Promise<void> => {
  const { activationCode } = req.body as { activationCode?: unknown };

  // Input validation
  if (!activationCode || typeof activationCode !== 'string') {
    res.status(400).json({
      success: false,
      error: 'activationCode is required and must be a string',
      reason: 'invalid_code',
    });
    return;
  }

  const trimmed = activationCode.trim();
  // Allow 16-char codes plus optional hyphens (XXXX-XXXX-XXXX-XXXX = 19 chars)
  const stripped = trimmed.replace(/-/g, '');
  if (stripped.length < 16 || stripped.length > 32) {
    res.status(400).json({
      success: false,
      error: 'activationCode must be 16-32 alphanumeric characters',
      reason: 'invalid_code',
    });
    return;
  }

  const ipAddress =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';

  try {
    const result = await validateAndUseCode(trimmed, ipAddress, userAgent);

    if (!result.success) {
      res.status(401).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (err) {
    console.error('POST /api/session-key error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      reason: 'invalid_code',
    });
  }
});

/**
 * POST /api/session-key/report-invalid
 * 客户端报告 sessionKey 验证失败，标记为失效
 *
 * Body: { sessionKey: string }
 * Success: 200 { success: true }
 */
router.post('/session-key/report-invalid', async (req: Request, res: Response): Promise<void> => {
  const { sessionKey } = req.body as { sessionKey?: unknown };

  if (!sessionKey || typeof sessionKey !== 'string') {
    res.status(400).json({
      success: false,
      error: 'sessionKey is required',
    });
    return;
  }

  try {
    const { markSessionKeyAsInvalid } = await import('../services/activationCodeService');
    await markSessionKeyAsInvalid(sessionKey);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('POST /api/session-key/report-invalid error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
