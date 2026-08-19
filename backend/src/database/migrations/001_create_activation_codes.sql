CREATE TABLE IF NOT EXISTS `activation_codes` (
  `id`          INT           NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(50)   NOT NULL,
  `maxUses`     INT           NOT NULL,
  `usedCount`   INT           NOT NULL DEFAULT 0,
  `expiryDate`  DATETIME      NOT NULL,
  `isActive`    BOOLEAN       NOT NULL DEFAULT TRUE,
  `createdAt`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastUsedAt`  DATETIME      NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_activation_codes_code` (`code`),
  KEY `idx_activation_codes_isActive` (`isActive`),
  KEY `idx_activation_codes_expiryDate` (`expiryDate`),
  KEY `idx_activation_codes_isActive_expiryDate` (`isActive`, `expiryDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
