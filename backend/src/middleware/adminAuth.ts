import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * 管理后台账号密码认证中间件
 * 首次访问时需要初始化账号密码
 */

let ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
let ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD || '';

/**
 * 生成密码 SHA256 哈希
 */
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * 检查是否已初始化
 */
export function isInitialized(): boolean {
  return Boolean(ADMIN_USERNAME && ADMIN_PASSWORD_HASH);
}

/**
 * 初始化管理员账号
 */
export async function initializeAdmin(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  // 验证输入
  if (!username || username.length < 3) {
    return { success: false, error: '用户名至少3个字符' };
  }
  
  if (!password || password.length < 6) {
    return { success: false, error: '密码至少6个字符' };
  }

  // 已初始化则不允许重复初始化
  if (isInitialized()) {
    return { success: false, error: '管理员账号已存在，无法重复初始化' };
  }

  try {
    // 生成密码哈希
    const passwordHash = hashPassword(password);
    
    // 更新内存中的值
    ADMIN_USERNAME = username;
    ADMIN_PASSWORD_HASH = passwordHash;

    // 写入 .env 文件
    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }

    // 检查是否已有配置
    const hasUsername = /^ADMIN_USERNAME=/m.test(envContent);
    const hasPassword = /^ADMIN_PASSWORD=/m.test(envContent);

    if (hasUsername) {
      envContent = envContent.replace(/^ADMIN_USERNAME=.*/m, `ADMIN_USERNAME=${username}`);
    } else {
      envContent += `\n# Admin Account\nADMIN_USERNAME=${username}\n`;
    }

    if (hasPassword) {
      envContent = envContent.replace(/^ADMIN_PASSWORD=.*/m, `ADMIN_PASSWORD=${passwordHash}`);
    } else {
      envContent += `ADMIN_PASSWORD=${passwordHash}\n`;
    }

    fs.writeFileSync(envPath, envContent, 'utf-8');

    console.log('[ADMIN INIT] Administrator account initialized successfully');
    
    return { success: true };
  } catch (err) {
    console.error('[ADMIN INIT] Failed to initialize:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * 验证账号密码
 */
function verifyCredentials(username: string, password: string): boolean {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH) {
    return false;
  }
  
  const passwordHash = hashPassword(password);
  return username === ADMIN_USERNAME && passwordHash === ADMIN_PASSWORD_HASH;
}

/**
 * 生成简单的 session token
 */
function generateSessionToken(username: string): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(16).toString('hex');
  const data = `${username}:${timestamp}:${random}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

// 存储活跃的 session（生产环境应使用 Redis）
const activeSessions = new Map<string, { username: string; createdAt: number }>();

// Session 有效期：24小时
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000;

/**
 * 清理过期 session
 */
function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [token, session] of activeSessions.entries()) {
    if (now - session.createdAt > SESSION_TIMEOUT) {
      activeSessions.delete(token);
    }
  }
}

// 每小时清理一次过期 session
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

/**
 * 检查初始化状态
 */
export async function checkInitHandler(req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    initialized: isInitialized()
  });
}

/**
 * 初始化接口
 */
export async function initHandler(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body as { username?: string; password?: string };
  
  if (!username || !password) {
    res.status(400).json({ 
      success: false, 
      error: '请提供用户名和密码' 
    });
    return;
  }

  const result = await initializeAdmin(username, password);
  
  if (result.success) {
    res.json({ success: true, message: '管理员账号初始化成功' });
  } else {
    res.status(400).json({ success: false, error: result.error });
  }
}

/**
 * 登录接口
 */
export async function loginHandler(req: Request, res: Response): Promise<void> {
  // 检查是否已初始化
  if (!isInitialized()) {
    res.status(403).json({ 
      success: false, 
      error: '请先初始化管理员账号',
      needInit: true
    });
    return;
  }

  const { username, password } = req.body as { username?: string; password?: string };
  
  if (!username || !password) {
    res.status(400).json({ 
      success: false, 
      error: '请提供用户名和密码' 
    });
    return;
  }

  // 验证账号密码
  if (!verifyCredentials(username, password)) {
    res.status(401).json({ 
      success: false, 
      error: '用户名或密码错误' 
    });
    return;
  }

  // 生成 session token
  const token = generateSessionToken(username);
  activeSessions.set(token, {
    username,
    createdAt: Date.now()
  });

  res.json({
    success: true,
    token,
    username,
    expiresIn: SESSION_TIMEOUT
  });
}

/**
 * 登出接口
 */
export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    activeSessions.delete(token);
  }
  
  res.json({ success: true, message: '已登出' });
}

/**
 * 认证中间件
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 如果未初始化，拒绝访问
  if (!isInitialized()) {
    res.status(403).json({ 
      success: false, 
      error: 'Admin account not initialized',
      needInit: true
    });
    return;
  }

  // 获取 Authorization header
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    res.status(401).json({ 
      success: false, 
      error: 'Unauthorized: Missing authorization header' 
    });
    return;
  }

  // 验证 Bearer token
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const session = activeSessions.get(token);
  
  if (!session) {
    res.status(401).json({ 
      success: false, 
      error: 'Unauthorized: Invalid or expired session' 
    });
    return;
  }

  // 检查 session 是否过期
  if (Date.now() - session.createdAt > SESSION_TIMEOUT) {
    activeSessions.delete(token);
    res.status(401).json({ 
      success: false, 
      error: 'Unauthorized: Session expired' 
    });
    return;
  }

  // 验证通过，将用户信息附加到请求
  (req as any).adminUser = session.username;
  next();
}

/**
 * IP 白名单中间件
 */
export function ipWhitelistMiddleware(req: Request, res: Response, next: NextFunction): void {
  const allowedIPs = process.env.ADMIN_ALLOWED_IPS?.split(',').map(ip => ip.trim()) || [];
  
  // 如果未设置白名单，则不启用 IP 限制
  if (allowedIPs.length === 0) {
    next();
    return;
  }

  // 获取客户端 IP（支持代理）
  const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() 
    || req.socket.remoteAddress 
    || '';

  // 检查是否在白名单中（支持 IPv4 和 IPv6）
  const isAllowed = allowedIPs.some(allowedIP => {
    if (allowedIP === 'localhost' || allowedIP === '127.0.0.1') {
      return clientIP === '::1' || clientIP === '127.0.0.1' || clientIP.includes('127.0.0.1');
    }
    return clientIP === allowedIP || clientIP.includes(allowedIP);
  });

  if (!isAllowed) {
    console.warn(`[SECURITY] Blocked admin access from IP: ${clientIP}`);
    res.status(403).json({ 
      success: false, 
      error: 'Forbidden: IP not in whitelist' 
    });
    return;
  }

  next();
}
