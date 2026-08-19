-- 扩展 session_keys 表，存储完整账号信息
ALTER TABLE `session_keys`
  ADD COLUMN `email` VARCHAR(255) NULL AFTER `label`,
  ADD COLUMN `uuid` VARCHAR(50) NULL AFTER `email`,
  ADD COLUMN `anonymousId` VARCHAR(100) NULL AFTER `uuid`,
  ADD COLUMN `deviceId` VARCHAR(100) NULL AFTER `anonymousId`,
  ADD COLUMN `routingHint` TEXT NULL AFTER `deviceId`,
  ADD COLUMN `cfBm` TEXT NULL COMMENT 'Cloudflare __cf_bm cookie' AFTER `routingHint`,
  ADD COLUMN `cfUvid` TEXT NULL COMMENT 'Cloudflare _cfuvid cookie' AFTER `cfBm`,
  ADD COLUMN `lastCheckStatus` ENUM('healthy', 'expired', 'error', 'unknown') DEFAULT 'unknown' AFTER `cfUvid`,
  ADD COLUMN `lastCheckedAt` DATETIME NULL AFTER `lastCheckStatus`,
  ADD KEY `idx_session_keys_email` (`email`),
  ADD KEY `idx_session_keys_uuid` (`uuid`);
