import { RowDataPacket } from 'mysql2';

/**
 * Represents a usage log record in the database.
 * Maps to the `usage_logs` table.
 */
export interface UsageLog extends RowDataPacket {
  id: number;
  activationCode: string;
  usedAt: string;        // ISO 8601
  ipAddress: string;
  userAgent: string;
  success: boolean;
  errorReason: string | null;
}

/**
 * Input required to create a new usage log record.
 */
export interface CreateUsageLogInput {
  activationCode: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  errorReason?: string;
}
