CREATE TABLE IF NOT EXISTS `session_keys` (
  `id`          INT           NOT NULL AUTO_INCREMENT,
  `sessionKey`  TEXT          NOT NULL,
  `label`       VARCHAR(100)  NULL COMMENT '备注标签，如账号描述',
  `isActive`    BOOLEAN       NOT NULL DEFAULT TRUE,
  `createdAt`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastUsedAt`  DATETIME      NULL,
  `usedCount`   INT           NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_session_keys_isActive` (`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
