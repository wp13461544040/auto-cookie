import { ResultSetHeader, RowDataPacket, OkPacket } from 'mysql2/promise';
import { pool } from './connection';

export { pool };

/**
 * 执行参数化 SQL 查询
 * @param sql    - 带占位符的 SQL 语句
 * @param params - 绑定参数
 * @returns 查询结果（行数组或 ResultSetHeader）
 */
export async function query<T extends RowDataPacket[] | OkPacket | ResultSetHeader>(
  sql: string,
  params?: (string | number | boolean | null | Date)[]
): Promise<T> {
  const [rows] = await pool.execute<T>(sql, params);
  return rows;
}
