-- 添加 proxy 字段到 session_keys 表
ALTER TABLE `session_keys`
  ADD COLUMN `proxy` VARCHAR(255) NULL COMMENT '代理地址，如 http://127.0.0.1:7890' AFTER `cfUvid`;
