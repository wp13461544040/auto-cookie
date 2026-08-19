-- Claude Account Switcher Database Schema

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

CREATE TABLE IF NOT EXISTS `usage_logs` (
  `id`              INT           NOT NULL AUTO_INCREMENT,
  `activationCode`  VARCHAR(50)   NOT NULL,
  `usedAt`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ipAddress`       VARCHAR(45)   NOT NULL,
  `userAgent`       TEXT          NOT NULL,
  `success`         BOOLEAN       NOT NULL,
  `errorReason`     VARCHAR(100)  NULL,
  PRIMARY KEY (`id`),
  KEY `idx_usage_logs_activationCode` (`activationCode`),
  KEY `idx_usage_logs_usedAt` (`usedAt`),
  CONSTRAINT `fk_usage_logs_code`
    FOREIGN KEY (`activationCode`)
    REFERENCES `activation_codes` (`code`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
