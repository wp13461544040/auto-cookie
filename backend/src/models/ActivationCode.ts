import { RowDataPacket } from 'mysql2';

/**
 * Represents an activation code record in the database.
 * Maps to the `activation_codes` table.
 */
export interface ActivationCode extends RowDataPacket {
  id: number;
  code: string;
  maxUses: number;
  usedCount: number;
  expiryDate: string;   // ISO 8601
  isActive: boolean;
  createdAt: string;    // ISO 8601
  lastUsedAt: string | null; // ISO 8601, null if never used
}

/**
 * Input required to create a new activation code record.
 */
export interface CreateActivationCodeInput {
  code: string;
  maxUses: number;
  expiryDate: string; // ISO 8601
}
