/**
 * 自动解绑 SessionKey 定时任务
 * 支持运行时动态更新配置（后台管理页面可实时调整）
 */

import { query } from '../database';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

// ── 内部状态 ──────────────────────────────────────────────────────────────────

interface UnbindConfig {
  hours: number; // 0 = 禁用
}

interface UnbindStatus {
  nextCheck: string | null;  // ISO 时间字符串
  lastUnbindCount: number;   // 上次解绑数量
}

/** 当前配置，初始值从环境变量读取 */
let _config: UnbindConfig = {
  hours: parseInt(process.env.AUTO_UNBIND_HOURS || '8', 10),
};

/** 运行状态 */
let _status: UnbindStatus = {
  nextCheck: null,
  lastUnbindCount: 0,
};

/** 当前定时器句柄 */
let _timer: ReturnType<typeof setInterval> | null = null;

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function toMySQLDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function calcNextCheck(): string {
  const next = new Date(Date.now() + 3600_000); // 1小时后
  return next.toISOString();
}

// ── 核心执行逻辑 ──────────────────────────────────────────────────────────────

/**
 * 执行一次自动解绑，返回实际解绑数量
 */
export async function runUnbindNow(): Promise<number> {
  const { hours } = _config;

  if (hours <= 0) {
    console.log('[AutoUnbind] 自动解绑已禁用，跳过执行');
    return 0;
  }

  const cutoff = new Date(Date.now() - hours * 3_600_000);
  const cutoffStr = toMySQLDateTime(cutoff);

  console.log(`[AutoUnbind] 开始执行，解绑超过 ${hours} 小时未使用的 SessionKey（截止: ${cutoffStr}）`);

  // 先查出待解绑记录，用于日志
  const pending = await query<RowDataPacket[]>(
    `SELECT id, sessionKey, activationCode, lastUsedAt
     FROM session_keys
     WHERE isActive = TRUE
       AND activationCode IS NOT NULL
       AND lastUsedAt < ?`,
    [cutoffStr]
  );

  if (pending.length === 0) {
    console.log('[AutoUnbind] 没有需要解绑的 SessionKey');
    _status.lastUnbindCount = 0;
    _status.nextCheck = calcNextCheck();
    return 0;
  }

  // 批量解绑
  const result = await query<ResultSetHeader>(
    `UPDATE session_keys
     SET isActive = FALSE, activationCode = NULL
     WHERE isActive = TRUE
       AND activationCode IS NOT NULL
       AND lastUsedAt < ?`,
    [cutoffStr]
  );

  const count = (result as ResultSetHeader).affectedRows;

  for (const row of pending) {
    const preview = String(row['sessionKey']).substring(0, 20);
    const lastUsed = new Date(row['lastUsedAt'] as string);
    const hoursAgo = Math.round((Date.now() - lastUsed.getTime()) / 3_600_000);
    console.log(
      `[AutoUnbind]   解绑: ${preview}... (激活码: ${row['activationCode']}, ${hoursAgo}小时前)`
    );
  }

  console.log(`[AutoUnbind] ✓ 本次解绑 ${count} 个 SessionKey`);

  _status.lastUnbindCount = count;
  _status.nextCheck = calcNextCheck();

  return count;
}

// ── 定时器管理 ────────────────────────────────────────────────────────────────

function stopTimer(): void {
  if (_timer !== null) {
    clearInterval(_timer);
    _timer = null;
  }
}

function startTimer(): void {
  stopTimer();

  if (_config.hours <= 0) {
    _status.nextCheck = null;
    console.log('[AutoUnbind] 定时器已停止（hours=0）');
    return;
  }

  _status.nextCheck = calcNextCheck();

  _timer = setInterval(() => {
    runUnbindNow().catch(err => {
      console.error('[AutoUnbind] 定时执行失败:', err);
    });
  }, 3_600_000); // 每小时

  console.log(`[AutoUnbind] 定时器已启动，每小时检查一次（解绑超过 ${_config.hours} 小时的 SessionKey）`);
}

// ── 对外接口 ──────────────────────────────────────────────────────────────────

/** 读取当前配置 */
export function getUnbindConfig(): Readonly<UnbindConfig> {
  return { ..._config };
}

/** 读取当前运行状态 */
export function getUnbindStatus(): Readonly<UnbindStatus> {
  return { ..._status };
}

/**
 * 动态更新配置（后台管理页面调用）
 * 会立即重启定时器使新配置生效
 */
export function setUnbindConfig(newConfig: Partial<UnbindConfig>): void {
  if (newConfig.hours !== undefined) {
    _config.hours = Math.max(0, Math.floor(newConfig.hours));
  }

  console.log(`[AutoUnbind] 配置已更新: hours=${_config.hours}`);

  // 重启定时器使新配置立即生效
  startTimer();
}

/**
 * 服务启动时调用，初始化定时器
 */
export function startAutoUnbindScheduler(): void {
  console.log(`[AutoUnbind] 初始化，AUTO_UNBIND_HOURS=${_config.hours}`);

  // 启动时立即执行一次
  runUnbindNow().catch(err => {
    console.error('[AutoUnbind] 初始执行失败:', err);
  });

  startTimer();
}
