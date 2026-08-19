import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import sessionKeyRouter from './routes/sessionKey';
import healthRouter from './routes/health';
import adminRouter from './routes/admin';
import { apiLimiter, blockingLimiter } from './middleware/rateLimiter';
import { requestLogger } from './middleware/logger';
import { 
  adminAuthMiddleware, 
  ipWhitelistMiddleware, 
  loginHandler, 
  logoutHandler,
  checkInitHandler,
  initHandler
} from './middleware/adminAuth';

const app = express();

// 静态文件服务 - 提供前端页面
const staticPath = path.join(__dirname, '../../');
app.use(express.static(staticPath, {
  index: false, // 不自动返回 index.html
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
  }
}));

// 管理后台页面路由
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(staticPath, 'admin.html'));
});

app.get('/admin', (req, res) => {
  res.redirect('/admin.html');
});

// 安全头 — 满足 req 4.5 / 8.7（管理页面需要放宽 CSP）
app.use(helmet({
  contentSecurityPolicy: false,
}));

// CORS — 满足 req 4.6
app.use(cors());

// 请求日志（响应时间、慢请求告警）— 满足 req 7.2 / 14.2
app.use(requestLogger);

// Parse JSON request bodies
app.use(express.json());

// 健康检查端点 — 满足 req 14.3
app.use('/health', healthRouter);

// 初始化和登录接口（不需要认证）
app.get('/admin/init/check', ipWhitelistMiddleware, checkInitHandler);
app.post('/admin/init', ipWhitelistMiddleware, initHandler);
app.post('/admin/login', ipWhitelistMiddleware, loginHandler);
app.post('/admin/logout', logoutHandler);

// Routes
app.use('/api', sessionKeyRouter);

// 管理接口 - 添加认证和 IP 白名单
app.use('/admin', ipWhitelistMiddleware, adminAuthMiddleware, adminRouter);

export default app;
