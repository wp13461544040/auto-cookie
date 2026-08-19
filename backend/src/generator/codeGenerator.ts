import crypto from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { query } from '../database';
import { ActivationCode } from '../models/ActivationCode';

/** 将 Date 转为 MySQL DATETIME 格式 'YYYY-MM-DD HH:MM:SS' */
function toMySQLDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
         `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 激活码字符集：排除 I, O, 0, 1 易混淆字符 */
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_CHARS = 16;
const MAX_GENERATION_ATTEMPTS = 10;

/**
 * 生成随机激活码字符串。
 * 格式：XXXX-XXXX-XXXX-XXXX（16字符 + 3连字符 = 19字符）
 * 使用 crypto.randomBytes 保证随机性。
 *
 * @param length - 激活码字符数（不含连字符），默认 16
 * @returns 格式化后的激活码字符串
 */
export function generateRandomCode(length = 16): string {
  const bytes = crypto.randomBytes(length);
  let raw = '';
  for (let i = 0; i < length; i++) {
    raw += CHARSET[bytes[i] % CHARSET.length];
  }

  // 每 4 个字符插入连字符
  const parts: string[] = [];
  for (let i = 0; i < raw.length; i += 4) {
    parts.push(raw.slice(i, i + 4));
  }
  return parts.join('-');
}

/**
 * 创建一条激活码记录并写入数据库。
 * - 检查唯一性（最多重试 10 次）
 * - 计算过期时间 = 当前时间 + expiryDays * 86400000 毫秒
 * - INSERT 到 activation_codes 表
 * 
 * 新逻辑：激活码不预先绑定 sessionKeys，只设置可用次数
 * sessionKeys 在使用时从全局未使用池中动态分配
 *
 * @param maxUses    - 最大使用次数
 * @param expiryDays - 有效天数（正整数）
 * @returns 生成的激活码字符串
 */
export async function createActivationCode(
  maxUses: number,
  expiryDays: number
): Promise<string> {
  let code = '';
  let isUnique = false;
  let attempts = 0;

  while (!isUnique && attempts < MAX_GENERATION_ATTEMPTS) {
    code = generateRandomCode(CODE_CHARS);

    // 参数化查询检查唯一性
    const existing = await query<RowDataPacket[]>(
      'SELECT `code` FROM `activation_codes` WHERE `code` = ?',
      [code]
    );
    isUnique = existing.length === 0;
    attempts++;
  }

  if (!isUnique) {
    throw new Error(
      `Failed to generate unique activation code after ${MAX_GENERATION_ATTEMPTS} attempts`
    );
  }

  const now = new Date();
  const expiryDate = new Date(now.getTime() + expiryDays * 86400000);

  await query<ResultSetHeader>(
    'INSERT INTO `activation_codes` (`code`, `maxUses`, `usedCount`, `expiryDate`, `isActive`, `createdAt`) VALUES (?, ?, ?, ?, ?, ?)',
    [code, maxUses, 0, toMySQLDateTime(expiryDate), true, toMySQLDateTime(now)]
  );

  return code;
}

export interface CodeFilters {
  isActive?: boolean;
  expiryDateFrom?: string;
  expiryDateTo?: string;
}

/**
 * 查询激活码列表，支持过滤条件。
 *
 * @param filters - 可选过滤条件
 * @returns ActivationCode 数组
 */
export async function listActivationCodes(filters?: CodeFilters): Promise<ActivationCode[]> {
  const conditions: string[] = [];
  const params: (string | number | boolean | null | Date)[] = [];

  if (filters?.isActive !== undefined) {
    conditions.push('`isActive` = ?');
    params.push(filters.isActive);
  }

  if (filters?.expiryDateFrom) {
    conditions.push('`expiryDate` >= ?');
    params.push(filters.expiryDateFrom);
  }

  if (filters?.expiryDateTo) {
    conditions.push('`expiryDate` <= ?');
    params.push(filters.expiryDateTo);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM \`activation_codes\` ${whereClause} ORDER BY \`createdAt\` DESC`;

  return query<ActivationCode[]>(sql, params.length > 0 ? params : undefined);
}

/**
 * 禁用指定激活码（设置 isActive = false）。
 *
 * @param code - 要禁用的激活码
 */
export async function disableCode(code: string): Promise<void> {
  await query<ResultSetHeader>(
    'UPDATE `activation_codes` SET `isActive` = ? WHERE `code` = ?',
    [false, code]
  );
}

/**
 * 导出激活码列表为 CSV 或 JSON 格式。
 *
 * CSV 表头：id,code,maxUses,usedCount,expiryDate,isActive,createdAt,lastUsedAt
 *
 * @param format - 'csv' 或 'json'
 * @returns 格式化后的字符串
 */
export async function exportCodes(format: 'csv' | 'json'): Promise<string> {
  const codes = await listActivationCodes();

  if (format === 'json') {
    return JSON.stringify(codes, null, 2);
  }

  // CSV 格式
  const header = 'id,code,maxUses,usedCount,expiryDate,isActive,createdAt,lastUsedAt';
  const rows = codes.map((c) => {
    const escape = (v: string | number | boolean | null | undefined): string => {
      if (v === null || v === undefined) return '';
      const str = String(v);
      // 含逗号或引号时需要加引号
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    return [
      escape(c.id),
      escape(c.code),
      escape(c.maxUses),
      escape(c.usedCount),
      escape(c.expiryDate),
      escape(c.isActive),
      escape(c.createdAt),
      escape(c.lastUsedAt),
    ].join(',');
  });

  return [header, ...rows].join('\n');
}
