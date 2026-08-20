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

// 安全头 — 满足 req 4.5 / 8.7（管理页面需要放宽 CSP）
app.use(helmet({
  contentSecurityPolicy: false,
}));

// CORS — 满足 req 4.6
app.use(cors());

// 静态文件服务 - 提供前端页面
// 在 Docker 容器中，静态文件需要通过 volume 挂载或复制到容器
// 这里配置为从项目根目录提供静态文件
app.get('/admin.html', (req, res) => {
  // 使用 resolve 获取绝对路径，__dirname 是 /app/dist
  const adminPath = path.resolve(__dirname, '../admin.html');
  res.sendFile(adminPath, (err) => {
    if (err) {
      console.error('Failed to send admin.html:', err);
      console.error('Tried path:', adminPath);
      res.status(404).send('Admin page not found');
    }
  });
});

app.get('/admin', (req, res) => {
  res.redirect('/admin.html');
});

// 提供其他静态文件（CSS、JS、图标等）
app.use(express.static(path.resolve(__dirname, '../'), {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
  }
}));

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
