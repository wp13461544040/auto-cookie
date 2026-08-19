import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * apiLimiter: 每分钟最多 10 次请求
 * 满足 req 8.4 — API 每 IP 每分钟限速 10 次，超限返回 429
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
    reason: 'rate_limited',
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later.',
      reason: 'rate_limited',
    });
  },
});

/**
 * 内存存储：记录每个 IP 的失败次数和窗口起始时间
 * 满足 req 8.5 — 1 小时内 50 次失败则封锁该 IP
 */
interface FailRecord {
  count: number;
  windowStart: number;
}

const failureMap = new Map<string, FailRecord>();

const FAILURE_WINDOW_MS = 60 * 60 * 1000; // 1 小时
const MAX_FAILURES = 50;

/**
 * 记录一次失败尝试。若该 IP 在 1 小时内失败次数达到 50，返回 true（表示应封锁）。
 */
export function recordFailure(ip: string): boolean {
  const now = Date.now();
  const record = failureMap.get(ip);

  if (!record || now - record.windowStart > FAILURE_WINDOW_MS) {
    // 新窗口
    failureMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  record.count += 1;
  return record.count >= MAX_FAILURES;
}

/**
 * 检查某 IP 是否已被封锁（失败次数 >= 50 且在窗口内）
 */
export function isBlocked(ip: string): boolean {
  const now = Date.now();
  const record = failureMap.get(ip);
  if (!record) return false;
  if (now - record.windowStart > FAILURE_WINDOW_MS) {
    failureMap.delete(ip);
    return false;
  }
  return record.count >= MAX_FAILURES;
}

/**
 * blockingLimiter: Express 中间件，拦截已被封锁的 IP
 * 用于 /api 路由之前，若 IP 已封锁则返回 429
 */
export function blockingLimiter(req: Request, res: Response, next: () => void): void {
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';

  if (isBlocked(ip)) {
    res.status(429).json({
      success: false,
      error: 'Your IP has been temporarily blocked due to too many failed attempts.',
      reason: 'ip_blocked',
    });
    return;
  }

  next();
}
