import { Router, Request, Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { query } from '../database';
import { createActivationCode, listActivationCodes, disableCode } from '../generator/codeGenerator';
import * as https from 'https';
import * as http from 'http';

const router = Router();

// 使用require加载ESM代理库
// @ts-ignore
const HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent;
// @ts-ignore
const SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent;

/**
 * 使用代理执行 HTTPS GET 请求
 */
function httpsGetWithProxy(url: string, headers: Record<string, string>, proxyUrl: string | null, timeout: number = 15000): Promise<{
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    let agent: http.Agent | undefined;
    if (proxyUrl) {
      try {
        if (proxyUrl.startsWith('socks')) {
          agent = new SocksProxyAgent(proxyUrl);
        } else {
          agent = new HttpsProxyAgent(proxyUrl);
        }
      } catch (err) {
        console.error(`代理配置错误: ${proxyUrl}`, err);
      }
    }

    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers,
      agent,
      timeout,
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers as Record<string, string | string[]>,
          body,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/** 将 Date 转为 MySQL DATETIME 格式 */
function toMySQLDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
         `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// ── 激活码管理 ─────────────────────────────────────────────────────────────

/**
 * POST /admin/codes
 * 生成新激活码（不预先绑定sessionKey）
 * Body: { 
 *   maxUses: number,
 *   count?: number,
 *   expiryUnit: 'hours' | 'days' | 'weeks' | 'months',
 *   expiryValue: number
 * }
 */
router.post('/codes', async (req: Request, res: Response): Promise<void> => {
  const { maxUses, count = 1, expiryUnit, expiryValue } = req.body as {
    maxUses?: number;
    count?: number;
    expiryUnit?: 'hours' | 'days' | 'weeks' | 'months';
    expiryValue?: number;
  };

  if (!maxUses || maxUses < 1) {
    res.status(400).json({ success: false, error: 'maxUses must be a positive integer' });
    return;
  }

  if (!expiryUnit || !['hours', 'days', 'weeks', 'months'].includes(expiryUnit)) {
    res.status(400).json({ success: false, error: 'expiryUnit must be one of: hours, days, weeks, months' });
    return;
  }

  if (!expiryValue || expiryValue < 1) {
    res.status(400).json({ success: false, error: 'expiryValue must be a positive integer' });
    return;
  }

  // 计算过期天数（转换为天数用于兼容现有函数）
  let expiryDays: number;
  switch (expiryUnit) {
    case 'hours':
      expiryDays = expiryValue / 24;
      break;
    case 'days':
      expiryDays = expiryValue;
      break;
    case 'weeks':
      expiryDays = expiryValue * 7;
      break;
    case 'months':
      expiryDays = expiryValue * 30; // 近似30天/月
      break;
  }

  const batchCount = Math.min(Math.max(1, Math.floor(count)), 100);
  const codes: string[] = [];

  try {
    for (let i = 0; i < batchCount; i++) {
      const code = await createActivationCode(maxUses, expiryDays);
      codes.push(code);
    }
    res.json({ success: true, codes });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/**
 * GET /admin/codes
 * 获取激活码列表（含使用情况）
 * Query: ?isActive=true|false
 */
router.get('/codes', async (req: Request, res: Response): Promise<void> => {
  try {
    const isActiveParam = req.query['isActive'];
    const filters: { isActive?: boolean } = {};
    if (isActiveParam === 'true') filters.isActive = true;
    if (isActiveParam === 'false') filters.isActive = false;

    const codes = await listActivationCodes(filters);
    res.json({ success: true, codes });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/**
 * PUT /admin/codes/:code
 * 更新激活码配置（最大使用次数和过期时间）
 * Body: { 
 *   maxUses?: number,
 *   expiryUnit?: 'hours' | 'days' | 'weeks' | 'months',
 *   expiryValue?: number
 * }
 */
router.put('/codes/:code', async (req: Request, res: Response): Promise<void> => {
  const { code } = req.params;
  const { maxUses, expiryUnit, expiryValue } = req.body as { 
    maxUses?: number;
    expiryUnit?: 'hours' | 'days' | 'weeks' | 'months';
    expiryValue?: number;
  };

  try {
    // 检查激活码是否存在
    const existing = await query<RowDataPacket[]>(
      'SELECT `usedCount`, `createdAt` FROM `activation_codes` WHERE `code` = ?',
      [code]
    );

    if (existing.length === 0) {
      res.status(404).json({ success: false, error: 'Activation code not found' });
      return;
    }

    const usedCount = existing[0]['usedCount'] as number;
    const createdAt = new Date(existing[0]['createdAt'] as string);
    const updates: string[] = [];
    const params: (number | string)[] = [];

    // 更新 maxUses
    if (maxUses !== undefined) {
      if (maxUses < 1) {
        res.status(400).json({ success: false, error: 'maxUses must be a positive integer' });
        return;
      }
      
      if (maxUses < usedCount) {
        res.status(400).json({ 
          success: false, 
          error: `maxUses cannot be less than usedCount (${usedCount})` 
        });
        return;
      }

      updates.push('`maxUses` = ?');
      params.push(maxUses);
    }

    // 更新过期时间
    if (expiryUnit && expiryValue) {
      if (!['hours', 'days', 'weeks', 'months'].includes(expiryUnit)) {
        res.status(400).json({ success: false, error: 'expiryUnit must be one of: hours, days, weeks, months' });
        return;
      }

      if (expiryValue < 1) {
        res.status(400).json({ success: false, error: 'expiryValue must be a positive integer' });
        return;
      }

      // 计算过期天数
      let expiryDays: number;
      switch (expiryUnit) {
        case 'hours':
          expiryDays = expiryValue / 24;
          break;
        case 'days':
          expiryDays = expiryValue;
          break;
        case 'weeks':
          expiryDays = expiryValue * 7;
          break;
        case 'months':
          expiryDays = expiryValue * 30;
          break;
      }

      // 从当前时间计算新的过期时间
      const now = new Date();
      const newExpiryDate = new Date(now.getTime() + expiryDays * 86400000);
      updates.push('`expiryDate` = ?');
      params.push(toMySQLDateTime(newExpiryDate));
    }

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: 'No updates provided' });
      return;
    }

    params.push(code);
    await query<ResultSetHeader>(
      `UPDATE \`activation_codes\` SET ${updates.join(', ')} WHERE \`code\` = ?`,
      params
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/**
 * DELETE /admin/codes/:code
 * 禁用激活码
 */
router.delete('/codes/:code', async (req: Request, res: Response): Promise<void> => {
  const { code } = req.params;
  try {
    await disableCode(code);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/**
 * GET /admin/codes/:code/logs
 * 获取指定激活码的使用日志
 */
router.get('/codes/:code/logs', async (req: Request, res: Response): Promise<void> => {
  const { code } = req.params;
  try {
    const logs = await query<RowDataPacket[]>(
      'SELECT * FROM `usage_logs` WHERE `activationCode` = ? ORDER BY `usedAt` DESC LIMIT 100',
      [code]
    );
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ── SessionKey 管理 ────────────────────────────────────────────────────────

/**
 * GET /admin/session-keys
 * 获取所有 sessionKey 列表，支持按激活码筛选
 * Query: ?activationCode=xxx
 */
router.get('/session-keys', async (req: Request, res: Response): Promise<void> => {
  try {
    const { activationCode } = req.query as { activationCode?: string };
    let sql = `SELECT 
      id, activationCode, label, email, uuid, isActive, 
      createdAt, lastUsedAt, usedCount, lastCheckStatus, lastCheckedAt, proxy,
      LEFT(sessionKey, 20) AS keyPreview 
      FROM session_keys`;
    const params: string[] = [];
    if (activationCode) {
      sql += ' WHERE `activationCode` = ?';
      params.push(activationCode);
    }
    sql += ' ORDER BY `createdAt` DESC';
    const keys = await query<RowDataPacket[]>(sql, params.length ? params : undefined);
    res.json({ success: true, keys });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

interface FullSessionKeyUpload {
  email?: string;
  uuid?: string;
  sessionKey?: string;
  anonymousId?: string;
  deviceId?: string;
  routingHint?: string;
  proxy?: string;
  ip_info?: {
    proxy?: string;
    [key: string]: any;
  };
  cookies?: {
    sessionKey?: string;
    routingHint?: string;
    __cf_bm?: string;
    _cfuvid?: string;
  };
}

/**
 * POST /admin/session-keys
 * 上传新 sessionKey（完整 JSON 格式）到全局池
 * Body: { sessionKeys: FullSessionKeyUpload[] }
 * 
 * 不再预先绑定到激活码，使用时从全局池动态分配
 */
router.post('/session-keys', async (req: Request, res: Response): Promise<void> => {
  const { sessionKeys } = req.body as {
    sessionKeys?: FullSessionKeyUpload | FullSessionKeyUpload[];
  };

  // 验证输入：必须是完整 JSON 格式
  if (!sessionKeys) {
    res.status(400).json({ 
      success: false, 
      error: 'sessionKeys is required',
      format: 'Expected: { sessionKeys: [...] }'
    });
    return;
  }

  // 统一转为数组
  let keyList: FullSessionKeyUpload[];
  if (Array.isArray(sessionKeys)) {
    keyList = sessionKeys;
  } else if (typeof sessionKeys === 'object') {
    keyList = [sessionKeys];
  } else {
    res.status(400).json({ 
      success: false, 
      error: 'sessionKeys must be an object or array of objects',
      format: 'Expected: { sessionKeys: [{email, uuid, cookies, ...}] }'
    });
    return;
  }

  if (keyList.length === 0) {
    res.status(400).json({ success: false, error: 'sessionKeys array is empty' });
    return;
  }

  try {
    const now = toMySQLDateTime(new Date());
    const ids: number[] = [];
    const errors: string[] = [];

    for (let i = 0; i < keyList.length; i++) {
      const item = keyList[i];
      
      // 从 cookies 对象或根级别获取 sessionKey
      let key = item.sessionKey || item.cookies?.sessionKey || '';
      key = key.trim();
      
      if (!key || key.length < 10) {
        errors.push(`Item ${i}: sessionKey missing or too short (min 10 chars)`);
        continue;
      }

      // 清洗 sessionKey 格式
      const cleanKey = key.includes('=') ? key.split('=').slice(1).join('=') : key;

      // 获取其他字段
      const email = item.email?.trim() || null;
      const uuid = item.uuid?.trim() || null;
      const anonymousId = item.anonymousId?.trim() || null;
      const deviceId = item.deviceId?.trim() || null;
      const routingHint = item.routingHint || item.cookies?.routingHint || null;
      const cfBm = item.cookies?.__cf_bm || null;
      const cfUvid = item.cookies?._cfuvid || null;
      // 代理优先级：proxy字段 > ip_info.proxy
      const proxy = item.proxy?.trim() || item.ip_info?.proxy?.trim() || null;

      // 不绑定激活码，activationCode 为 NULL
      const result = await query<ResultSetHeader>(
        `INSERT INTO session_keys 
        (activationCode, sessionKey, email, uuid, anonymousId, deviceId, routingHint, cfBm, cfUvid, proxy, isActive, createdAt) 
        VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)`,
        [cleanKey, email, uuid, anonymousId, deviceId, routingHint, cfBm, cfUvid, proxy, now]
      );
      ids.push((result as ResultSetHeader).insertId);
    }

    if (ids.length === 0) {
      res.status(400).json({ 
        success: false, 
        error: 'No valid sessionKeys to insert', 
        details: errors 
      });
      return;
    }

    const response: { success: boolean; ids: number[]; count: number; warnings?: string[] } = {
      success: true,
      ids,
      count: ids.length
    };

    if (errors.length > 0) {
      response.warnings = errors;
    }

    res.json(response);
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/**
 * DELETE /admin/session-keys/:id
 * 删除 sessionKey
 */
router.delete('/session-keys/:id', async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params['id'], 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid id' });
    return;
  }
  try {
    await query<ResultSetHeader>(
      'DELETE FROM `session_keys` WHERE `id` = ?',
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/**
 * POST /admin/session-keys/delete-expired
 * 删除所有失效的 sessionKeys
 */
router.post('/session-keys/delete-expired', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query<ResultSetHeader>(
      'DELETE FROM `session_keys` WHERE `lastCheckStatus` = ?',
      ['expired']
    );
    
    res.json({ 
      success: true, 
      count: result.affectedRows,
      message: `已删除 ${result.affectedRows} 个失效账号`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/**
 * GET /admin/stats
 * 统计概览
 */
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [[codeStats]] = await Promise.all([
      query<RowDataPacket[]>(`
        SELECT
          COUNT(*) AS total,
          SUM(isActive = 1 AND expiryDate > NOW()) AS active,
          SUM(isActive = 0) AS disabled,
          SUM(expiryDate <= NOW() AND isActive = 1) AS expired,
          SUM(usedCount) AS totalUses
        FROM activation_codes
      `),
    ]);

    const [[keyStats]] = await Promise.all([
      query<RowDataPacket[]>(`
        SELECT COUNT(*) AS total, SUM(isActive = 1) AS active
        FROM session_keys
      `),
    ]);

    res.json({ success: true, codes: codeStats, sessionKeys: keyStats });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/**
 * POST /admin/check-session-key
 * 检查 sessionKey 是否有效（调用 Claude API）
 * Body: { sessionKey: string, anonymousId?: string, deviceId?: string, proxy?: string }
 */
router.post('/check-session-key', async (req: Request, res: Response): Promise<void> => {
  const { sessionKey, anonymousId, deviceId, proxy } = req.body as {
    sessionKey?: string;
    anonymousId?: string;
    deviceId?: string;
    proxy?: string;
  };

  if (!sessionKey || typeof sessionKey !== 'string' || sessionKey.trim().length < 10) {
    res.status(400).json({ success: false, error: 'sessionKey is required' });
    return;
  }

  try {
    const cleanKey = sessionKey.trim();
    const key = cleanKey.includes('=') ? cleanKey.split('=').slice(1).join('=') : cleanKey;

    const headers: Record<string, string> = {
      'accept': '*/*',
      'content-type': 'application/json',
      'origin': 'https://claude.ai',
      'referer': 'https://claude.ai/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9',
      'anthropic-client-platform': 'web_claude_ai',
      'anthropic-client-version': '1.0.0',
      'anthropic-client-sha': '882d9a7d43eced6a100e636e1dfdebc55764bd78',
      'cookie': `sessionKey=${key}; sessionKeyLC=${Date.now()}`,
    };

    if (anonymousId) headers['anthropic-anonymous-id'] = anonymousId;
    if (deviceId) headers['anthropic-device-id'] = deviceId;

    const response = await httpsGetWithProxy(
      'https://claude.ai/api/account?statsig_hashing_algorithm=djb2',
      headers,
      proxy || null,
      15000
    );

    const contentType = String(response.headers['content-type'] || '');

    let status: 'healthy' | 'expired' | 'error' = 'error';
    let accountInfo: unknown = null;

    if (response.statusCode === 200) {
      status = 'healthy';
      if (contentType.includes('application/json')) {
        try {
          accountInfo = JSON.parse(response.body);
        } catch { /* ignore */ }
      }
    } else if (response.statusCode === 401 || response.statusCode === 403) {
      status = 'expired';
    } else {
      status = 'error';
    }

    res.json({ success: true, status, httpStatus: response.statusCode, contentType, accountInfo });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/**
 * POST /admin/batch-check-keys
 * 批量检查多个 sessionKey 的健康状态
 * Body: { keyIds?: number[], activationCode?: string, proxy?: string | string[] }
 */
router.post('/batch-check-keys', async (req: Request, res: Response): Promise<void> => {
  const { keyIds, activationCode, proxy } = req.body as {
    keyIds?: number[];
    activationCode?: string;
    proxy?: string | string[];
  };

  try {
    let sql = 'SELECT `id`, `sessionKey`, `anonymousId`, `deviceId`, `routingHint`, `cfBm`, `cfUvid`, `proxy` FROM `session_keys` WHERE `isActive` = TRUE';
    const params: (number | string)[] = [];

    if (keyIds && keyIds.length > 0) {
      sql += ' AND `id` IN (' + keyIds.map(() => '?').join(',') + ')';
      params.push(...keyIds);
    } else if (activationCode) {
      sql += ' AND `activationCode` = ?';
      params.push(activationCode);
    }

    sql += ' LIMIT 100';
    const keys = await query<RowDataPacket[]>(sql, params.length ? params : undefined);

    if (keys.length === 0) {
      res.json({ success: true, results: [], message: 'No active keys found' });
      return;
    }

    const results: Array<{ id: number; status: string; error?: string; debug?: any }> = [];
    const now = toMySQLDateTime(new Date());

    // 处理代理配置
    const proxyList: string[] = [];
    if (proxy) {
      if (Array.isArray(proxy)) {
        proxyList.push(...proxy.filter(p => p && p.trim()));
      } else if (typeof proxy === 'string' && proxy.trim()) {
        proxyList.push(proxy.trim());
      }
    }
    
    let proxyIndex = 0;
    const getNextProxy = (): string | null => {
      if (proxyList.length === 0) return null;
      const p = proxyList[proxyIndex % proxyList.length];
      proxyIndex++;
      return p;
    };

    for (const key of keys) {
      try {
        // 优先使用 sessionKey 自己的代理，否则使用全局代理池轮询
        const keyProxy = key['proxy'] as string | null;
        const currentProxy = keyProxy || getNextProxy();
        
        const raw = (key['sessionKey'] as string).trim();
        const cleanKey = raw.includes('=') ? raw.split('=').slice(1).join('=') : raw;

        const headers: Record<string, string> = {
          'accept': '*/*',
          'content-type': 'application/json',
          'origin': 'https://claude.ai',
          'referer': 'https://claude.ai/',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'accept-language': 'en-US,en;q=0.9',
          'anthropic-client-platform': 'web_claude_ai',
          'anthropic-client-version': '1.0.0',
          'anthropic-client-sha': '882d9a7d43eced6a100e636e1dfdebc55764bd78',
        };

        // 构造 cookie
        const cookies: string[] = [`sessionKey=${cleanKey}`, `sessionKeyLC=${Date.now()}`];
        if (key['routingHint']) cookies.push(`routingHint=${key['routingHint']}`);
        if (key['cfBm']) cookies.push(`__cf_bm=${key['cfBm']}`);
        if (key['cfUvid']) cookies.push(`_cfuvid=${key['cfUvid']}`);
        headers['cookie'] = cookies.join('; ');

        if (key['anonymousId']) headers['anthropic-anonymous-id'] = key['anonymousId'] as string;
        if (key['deviceId']) headers['anthropic-device-id'] = key['deviceId'] as string;

        // 使用支持代理的请求
        const response = await httpsGetWithProxy(
          'https://claude.ai/api/account?statsig_hashing_algorithm=djb2',
          headers,
          currentProxy,
          15000
        );

        const contentType = String(response.headers['content-type'] || '');
        let status: 'healthy' | 'expired' | 'error' = 'error';
        let debugInfo: any = {
          httpStatus: response.statusCode,
          contentType: contentType,
          usedProxy: currentProxy || 'direct'
        };

        // 根据文档：200=健康，401/403=失效，其他=错误
        if (response.statusCode === 200) {
          status = 'healthy';
          if (contentType.includes('application/json')) {
            try {
              debugInfo.accountData = JSON.parse(response.body);
            } catch (e) {
              // ignore
            }
          }
        } else if (response.statusCode === 401 || response.statusCode === 403) {
          status = 'expired';
          debugInfo.reason = `Account expired or unauthorized (${response.statusCode})`;
        } else {
          status = 'error';
          debugInfo.reason = `Network error or exception (${response.statusCode})`;
        }

        // 更新数据库状态（不删除账号，仅标记）
        await query<ResultSetHeader>(
          'UPDATE `session_keys` SET `lastCheckStatus` = ?, `lastCheckedAt` = ? WHERE `id` = ?',
          [status, now, key['id']]
        );

        results.push({ id: key['id'] as number, status, debug: debugInfo });
      } catch (err) {
        // 捕获异常时不删除，标记为 error
        await query<ResultSetHeader>(
          'UPDATE `session_keys` SET `lastCheckStatus` = ?, `lastCheckedAt` = ? WHERE `id` = ?',
          ['error', now, key['id']]
        );
        results.push({ id: key['id'] as number, status: 'error', error: String(err) });
      }

      // 间隔 200ms 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    res.json({ success: true, results, checked: results.length });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
