import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /health
 * 满足 req 14.3 — 健康检查端点，返回 200 和当前时间戳
 */
router.get('/', (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export default router;
