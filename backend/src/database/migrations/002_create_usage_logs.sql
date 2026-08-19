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
