-- 验证数据库表结构脚本
-- 在 MySQL 客户端中运行，检查表结构是否正确

USE claude_switcher;

-- 1. 检查 activation_codes 表
DESCRIBE activation_codes;

-- 2. 检查 session_keys 表（应该有 18 个字段）
DESCRIBE session_keys;

-- 3. 检查 usage_logs 表
DESCRIBE usage_logs;

-- 4. 验证 session_keys 表的关键字段
SELECT 
  COLUMN_NAME, 
  DATA_TYPE, 
  IS_NULLABLE, 
  COLUMN_DEFAULT, 
  COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'claude_switcher' 
  AND TABLE_NAME = 'session_keys'
ORDER BY ORDINAL_POSITION;

-- 5. 检查是否有 proxy 字段
SELECT COUNT(*) as proxy_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'claude_switcher'
  AND TABLE_NAME = 'session_keys'
  AND COLUMN_NAME = 'proxy';

-- 如果 proxy_exists = 0，说明缺少 proxy 字段
-- 如果 proxy_exists = 1，说明字段存在
