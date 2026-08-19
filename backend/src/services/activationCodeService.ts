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

  // Step 6: 从全局未使用的 session_keys 中选择一个健康的
  // 条件：activationCode IS NULL（未绑定）或 isActive = FALSE（已失效，可重新分配）
  // 优先选择从未使用过的（activationCode IS NULL AND usedCount = 0）
  const maxRetries = 10; // 最多尝试 10 个 key
  let attempts = 0;
  let sessionKey: string | null = null;
  let selectedKeyId: number | null = null;

  while (attempts < maxRetries && !sessionKey) {
    attempts++;

    // 优先级：1) 未绑定且未使用 2) 未绑定但可能检测过 3) 已失效可重新分配
    const keyRows = await query<RowDataPacket[]>(
      `SELECT id, sessionKey, anonymousId, deviceId, routingHint, cfBm, cfUvid 
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
      // 没有可用 key 了
      break;
    }

    const keyRow = keyRows[0] as {
      id: number;
      sessionKey: string;
      anonymousId?: string;
      deviceId?: string;
      routingHint?: string;
      cfBm?: string;
      cfUvid?: string;
    };

    // 清洗 sessionKey
    const raw = keyRow.sessionKey.trim();
    const cleanKey = raw.includes('=') ? raw.split('=').slice(1).join('=') : raw;

    // 健康检查
    const healthStatus = await checkSessionKeyHealth(cleanKey, keyRow);

    if (healthStatus === 'healthy') {
      // 健康，使用这个 key - 原子性更新绑定
      const bindResult = await query<ResultSetHeader>(
        `UPDATE session_keys 
         SET activationCode = ?, isActive = TRUE, lastUsedAt = ?, usedCount = usedCount + 1, 
             lastCheckStatus = 'healthy', lastCheckedAt = ?
         WHERE id = ? AND (activationCode IS NULL OR isActive = FALSE)`,
        [activationCode, toMySQLDateTime(now), toMySQLDateTime(now), keyRow.id]
      );

      if ((bindResult as ResultSetHeader).affectedRows > 0) {
        // 成功绑定
        sessionKey = cleanKey;
        selectedKeyId = keyRow.id;
      } else {
        // 被其他请求抢先绑定了，继续尝试下一个
        console.log(`[validateAndUseCode] SessionKey ${keyRow.id} already bound by another request, trying next...`);
      }
    } else {
      // 失效或错误，标记状态
      await query<ResultSetHeader>(
        'UPDATE session_keys SET lastCheckStatus = ?, lastCheckedAt = ?, isActive = FALSE WHERE id = ?',
        [healthStatus, toMySQLDateTime(now), keyRow.id]
      );
      console.log(`[validateAndUseCode] SessionKey ${keyRow.id} marked as ${healthStatus}, trying next...`);
    }
  }

  if (!sessionKey || !selectedKeyId) {
    // 回滚 usedCount
    await query<ResultSetHeader>(
      'UPDATE `activation_codes` SET `usedCount` = `usedCount` - 1 WHERE `code` = ?',
      [activationCode]
    );
    await logUsage({ activationCode, ipAddress, userAgent, success: false, errorReason: 'no_uses_left' });
    return { success: false, error: 'No healthy session keys available', reason: 'no_uses_left' };
  }

  const remainingUses = code.maxUses - code.usedCount - 1;

  await logUsage({ activationCode, ipAddress, userAgent, success: true });

  return { success: true, sessionKey, remainingUses };
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
