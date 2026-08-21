import crypto from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { query } from '../database';
import { ActivationCode } from '../models/ActivationCode';
import { CreateUsageLogInput } from '../models/UsageLog';

/** 将 Date 转为 MySQL DATETIME 格式 'YYYY-MM-DD HH:MM:SS' */
function toMySQLDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
         `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * 检查 sessionKey 健康状态
 * 调用 Claude API，返回 'healthy' | 'expired' | 'error'
 */
async function checkSessionKeyHealth(
  sessionKey: string,
  metadata?: { anonymousId?: string; deviceId?: string; routingHint?: string; cfBm?: string; cfUvid?: string }
): Promise<'healthy' | 'expired' | 'error'> {
  try {
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
    };

    // 构造 cookie 字符串
    const cookies: string[] = [`sessionKey=${sessionKey}`, `sessionKeyLC=${Date.now()}`];
    if (metadata?.routingHint) cookies.push(`routingHint=${metadata.routingHint}`);
    if (metadata?.cfBm) cookies.push(`__cf_bm=${metadata.cfBm}`);
    if (metadata?.cfUvid) cookies.push(`_cfuvid=${metadata.cfUvid}`);
    headers['cookie'] = cookies.join('; ');

    if (metadata?.anonymousId) headers['anthropic-anonymous-id'] = metadata.anonymousId;
    if (metadata?.deviceId) headers['anthropic-device-id'] = metadata.deviceId;

    const response = await fetch('https://claude.ai/api/account?statsig_hashing_algorithm=djb2', {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(8000), // 8秒超时
    });

    const contentType = response.headers.get('content-type') || '';

    if (response.status === 200 && contentType.includes('application/json')) {
      return 'healthy';
    } else if (response.status === 200 && contentType.includes('text/html')) {
      return 'expired'; // 重定向到登录页
    } else if (response.status === 401 || response.status === 403) {
      return 'expired';
    } else {
      return 'error';
    }
  } catch (err) {
    console.error('[checkSessionKeyHealth] error:', err);
    return 'error';
  }
}

export type ValidationReason = 'invalid_code' | 'disabled' | 'expired' | 'no_uses_left';

export interface ValidationResult {
  success: true;
  sessionKey: string;
  remainingUses: number;
  cookies: {
    __cf_bm?: string;
    _cfuvid?: string;
    sessionKey: string;
    sessionKeyLC: string;
    routingHint?: string;
    'ion-vk'?: string;
  };
  metadata?: {
    email?: string;
    uuid?: string;
    anonymousId?: string;
    deviceId?: string;
  };
}

export interface ValidationError {
  success: false;
  error: string;
  reason: ValidationReason;
}

/**
 * Validate an activation code and increment its usage count atomically.
 * Logs all attempts to usage_logs regardless of outcome.
 * 
 * 新逻辑：
 * 1. 验证激活码有效性和剩余次数
 * 2. 从全局未使用的 session_keys 中选择一个健康的
 * 3. 标记该 session_key 为已使用并绑定到此激活码
 * 4. 防止多个激活码使用同一个 session_key
 *
 * @param activationCode - The code to validate
 * @param ipAddress      - Caller's IP address for logging
 * @param userAgent      - Caller's User-Agent header for logging
 */
export async function validateAndUseCode(
  activationCode: string,
  ipAddress: string,
  userAgent: string
): Promise<ValidationResult | ValidationError> {
  // Step 1: Look up the code
  const rows = await query<ActivationCode[]>(
    'SELECT * FROM `activation_codes` WHERE `code` = ?',
    [activationCode]
  );

  if (rows.length === 0) {
    await logUsage({ activationCode, ipAddress, userAgent, success: false, errorReason: 'invalid_code' });
    return { success: false, error: 'Invalid activation code', reason: 'invalid_code' };
  }

  const code = rows[0];

  // Step 2: Check active status
  if (!code.isActive) {
    await logUsage({ activationCode, ipAddress, userAgent, success: false, errorReason: 'disabled' });
    return { success: false, error: 'Activation code is disabled', reason: 'disabled' };
  }

  // Step 3: Check expiry
  if (new Date(code.expiryDate) < new Date()) {
    await logUsage({ activationCode, ipAddress, userAgent, success: false, errorReason: 'expired' });
    return { success: false, error: 'Activation code has expired', reason: 'expired' };
  }

  // Step 4: Check remaining uses
  if (code.usedCount >= code.maxUses) {
    await logUsage({ activationCode, ipAddress, userAgent, success: false, errorReason: 'no_uses_left' });
    return { success: false, error: 'No remaining uses for this activation code', reason: 'no_uses_left' };
  }

  // Step 5: Atomic increment — only succeeds if usedCount hasn't changed
  const now = new Date();
  const updateResult = await query<ResultSetHeader>(
    'UPDATE `activation_codes` SET `usedCount` = `usedCount` + 1, `lastUsedAt` = ? WHERE `code` = ? AND `usedCount` < `maxUses`',
    [toMySQLDateTime(now), activationCode]
  );

  if ((updateResult as ResultSetHeader).affectedRows === 0) {
    // Race condition: another request already consumed the last use
    await logUsage({ activationCode, ipAddress, userAgent, success: false, errorReason: 'no_uses_left' });
    return { success: false, error: 'No remaining uses for this activation code', reason: 'no_uses_left' };
  }

  // Step 6: 从全局未使用的 session_keys 中选择一个
  // 服务器无外网环境，跳过健康检查，直接分配
  // 排除：1) 已绑定且激活的 2) 已标记为失效的
  const keyRows = await query<RowDataPacket[]>(
    `SELECT id, sessionKey, email, uuid, anonymousId, deviceId, routingHint, cfBm, cfUvid 
     FROM session_keys 
     WHERE (activationCode IS NULL OR isActive = FALSE) 
     AND (lastCheckStatus IS NULL OR lastCheckStatus != 'expired')
     ORDER BY 
       CASE 
         WHEN activationCode IS NULL AND usedCount = 0 THEN 1
         WHEN activationCode IS NULL THEN 2
         ELSE 3
       END,
       id ASC
     LIMIT 1 
     FOR UPDATE`,
    []
  );

  if (keyRows.length === 0) {
    // 回滚 usedCount
    await query<ResultSetHeader>(
      'UPDATE `activation_codes` SET `usedCount` = `usedCount` - 1 WHERE `code` = ?',
      [activationCode]
    );
    await logUsage({ activationCode, ipAddress, userAgent, success: false, errorReason: 'no_uses_left' });
    return { success: false, error: 'No session keys available', reason: 'no_uses_left' };
  }

  const keyRow = keyRows[0] as {
    id: number;
    sessionKey: string;
    email?: string;
    uuid?: string;
    anonymousId?: string;
    deviceId?: string;
    routingHint?: string;
    cfBm?: string;
    cfUvid?: string;
  };

  // 清洗 sessionKey
  const raw = keyRow.sessionKey.trim();
  const sessionKey = raw.includes('=') ? raw.split('=').slice(1).join('=') : raw;

  // 绑定到激活码（无健康检查）
  const bindResult = await query<ResultSetHeader>(
    `UPDATE session_keys 
     SET activationCode = ?, isActive = TRUE, lastUsedAt = ?, usedCount = usedCount + 1
     WHERE id = ? AND (activationCode IS NULL OR isActive = FALSE)`,
    [activationCode, toMySQLDateTime(now), keyRow.id]
  );

  if ((bindResult as ResultSetHeader).affectedRows === 0) {
    // 被其他请求抢先绑定了
    await query<ResultSetHeader>(
      'UPDATE `activation_codes` SET `usedCount` = `usedCount` - 1 WHERE `code` = ?',
      [activationCode]
    );
    await logUsage({ activationCode, ipAddress, userAgent, success: false, errorReason: 'no_uses_left' });
    return { success: false, error: 'Session key allocation conflict', reason: 'no_uses_left' };
  }

  const sessionKeyId = keyRow.id;

  const remainingUses = code.maxUses - code.usedCount - 1;

  await logUsage({ activationCode, ipAddress, userAgent, success: true });

  // 构造完整的 cookies 对象
  const cookies = {
    sessionKey: sessionKey, // 必需字段
    sessionKeyLC: Date.now().toString(), // 必需字段
    __cf_bm: keyRow.cfBm || undefined,
    _cfuvid: keyRow.cfUvid || undefined,
    routingHint: keyRow.routingHint || undefined,
    'ion-vk': undefined, // 可以从数据库扩展字段获取
  };

  const metadata = {
    email: keyRow.email || undefined,
    uuid: keyRow.uuid || undefined,
    anonymousId: keyRow.anonymousId || undefined,
    deviceId: keyRow.deviceId || undefined,
  };

  return { 
    success: true, 
    sessionKey, 
    remainingUses,
    cookies,
    metadata,
  };
}

/**
 * Record a usage attempt in the usage_logs table.
 */
export async function logUsage(input: CreateUsageLogInput): Promise<void> {
  await query<ResultSetHeader>(
    'INSERT INTO `usage_logs` (`activationCode`, `ipAddress`, `userAgent`, `success`, `errorReason`) VALUES (?, ?, ?, ?, ?)',
    [
      input.activationCode,
      input.ipAddress,
      input.userAgent,
      input.success,
      input.errorReason ?? null,
    ]
  );
}

/**
 * Mark a sessionKey as invalid (expired)
 * Called by client when validation fails
 * 同时解绑激活码，允许重新分配
 */
export async function markSessionKeyAsInvalid(sessionKey: string): Promise<void> {
  const now = new Date();
  await query<ResultSetHeader>(
    `UPDATE session_keys 
     SET isActive = FALSE, lastCheckStatus = 'expired', lastCheckedAt = ?, activationCode = NULL
     WHERE sessionKey = ? OR sessionKey = CONCAT('sessionKey=', ?)`,
    [toMySQLDateTime(now), sessionKey, sessionKey]
  );
  console.log(`[markSessionKeyAsInvalid] Marked key as expired and unbound: ${sessionKey.substring(0, 20)}...`);
}

/**
 * Rollback activation code usage count
 * Called when client validation fails
 */
export async function rollbackActivationCodeUsage(activationCode: string): Promise<void> {
  await query<ResultSetHeader>(
    `UPDATE activation_codes 
     SET usedCount = GREATEST(usedCount - 1, 0)
     WHERE code = ?`,
    [activationCode]
  );
  console.log(`[rollbackActivationCodeUsage] Rolled back usage for code: ${activationCode}`);
}
