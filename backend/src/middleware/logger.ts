import winston from 'winston';
import { Request, Response, NextFunction } from 'express';

/**
 * Winston logger — JSON 格式输出
 * 满足 req 14.2 — 记录 API 响应时间和数据库查询时间
 */
export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

/**
 * requestLogger: Express 中间件，记录每个请求及响应时间
 * 满足 req 7.2 / 14.2 — 慢请求（>3000ms）打印 warn 级别日志
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      durationMs,
      ip:
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    };

    if (durationMs > 3000) {
      // 满足 req 7.2 — 慢请求（>3000ms）warn 级别
      logger.warn({ ...logData, message: 'Slow request detected' });
    } else {
      logger.info({ ...logData, message: 'Request completed' });
    }
  });

  next();
}

/**
 * logSlowQuery: 记录慢数据库查询
 * 满足 req 7.3 — 查询超过 200ms 打印 warn 级别日志
 *
 * @param ms  查询耗时（毫秒）
 * @param sql SQL 语句描述
 */
export function logSlowQuery(ms: number, sql: string): void {
  if (ms > 200) {
    logger.warn({
      message: 'Slow query detected',
      durationMs: ms,
      sql,
    });
  }
}
