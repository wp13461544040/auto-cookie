-- 手动数据库迁移脚本
-- 如果自动迁移失败，请在 MySQL 中手动执行此脚本

USE claude_switcher;

-- 检查 proxy 字段是否已存在
SET @column_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = 'claude_switcher' 
    AND TABLE_NAME = 'session_keys' 
    AND COLUMN_NAME = 'proxy'
);

-- 如果不存在，则添加 proxy 字段
SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `session_keys` ADD COLUMN `proxy` VARCHAR(255) NULL COMMENT ''代理地址'' AFTER `cfUvid`',
  'SELECT ''proxy column already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 验证结果
SELECT 
  COLUMN_NAME, 
  DATA_TYPE, 
  IS_NULLABLE, 
  COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'claude_switcher' 
  AND TABLE_NAME = 'session_keys'
  AND COLUMN_NAME = 'proxy';

-- 如果上面查询返回 1 行，说明 proxy 字段已成功添加
