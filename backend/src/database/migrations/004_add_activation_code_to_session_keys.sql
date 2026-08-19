-- 给 session_keys 表添加 activation_code 字段，建立与激活码的绑定关系
ALTER TABLE `session_keys`
  ADD COLUMN `activationCode` VARCHAR(50) NULL AFTER `id`,
  ADD KEY `idx_session_keys_activationCode_isActive` (`activationCode`, `isActive`);
