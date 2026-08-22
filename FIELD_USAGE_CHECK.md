# 字段使用检查报告

## session_keys 表字段使用情况

### 数据库表定义（18个字段）

| 字段 | 类型 | 使用位置 | 状态 |
|------|------|----------|------|
| id | INT | admin.ts (SELECT, DELETE) | ✅ |
| activationCode | VARCHAR(50) | admin.ts (INSERT, SELECT, UPDATE), activationCodeService.ts (UPDATE) | ✅ |
| sessionKey | TEXT | admin.ts (INSERT, SELECT) | ✅ |
| label | VARCHAR(100) | admin.ts (SELECT) | ✅ |
| email | VARCHAR(255) | admin.ts (INSERT, SELECT) | ✅ |
| uuid | VARCHAR(50) | admin.ts (INSERT, SELECT) | ✅ |
| anonymousId | VARCHAR(100) | admin.ts (INSERT, SELECT) | ✅ |
| deviceId | VARCHAR(100) | admin.ts (INSERT, SELECT) | ✅ |
| routingHint | TEXT | admin.ts (INSERT, SELECT) | ✅ |
| cfBm | TEXT | admin.ts (INSERT, SELECT) | ✅ |
| cfUvid | TEXT | admin.ts (INSERT, SELECT) | ✅ |
| **proxy** | VARCHAR(255) | admin.ts (INSERT, SELECT) | ✅ **新增** |
| lastCheckStatus | ENUM | admin.ts (SELECT, UPDATE, DELETE) | ✅ |
| lastCheckedAt | DATETIME | admin.ts (SELECT, UPDATE) | ✅ |
| isActive | BOOLEAN | admin.ts (INSERT, SELECT, UPDATE), autoUnbindScheduler.ts (UPDATE) | ✅ |
| createdAt | DATETIME | admin.ts (INSERT, SELECT) | ✅ |
| lastUsedAt | DATETIME | admin.ts (SELECT), activationCodeService.ts (UPDATE) | ✅ |
| usedCount | INT | admin.ts (SELECT), activationCodeService.ts (UPDATE) | ✅ |

### 代码中的 INSERT 语句

**admin.ts (批量上传)**
```typescript
INSERT INTO session_keys 
(activationCode, sessionKey, email, uuid, anonymousId, deviceId, 
 routingHint, cfBm, cfUvid, proxy, isActive, createdAt) 
VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)
```
✅ 字段顺序正确，包含 proxy

**activationCodeService.ts (切换账号)**
```typescript
UPDATE session_keys 
SET activationCode = ?, isActive = TRUE, lastUsedAt = ?, usedCount = usedCount + 1
WHERE id = ? AND (activationCode IS NULL OR isActive = FALSE)
```
✅ 仅更新必要字段

### 代码中的 SELECT 语句

**admin.ts (获取列表)**
```typescript
SELECT 
  id, activationCode, label, email, uuid, isActive, 
  createdAt, lastUsedAt, usedCount, lastCheckStatus, lastCheckedAt, proxy,
  LEFT(sessionKey, 20) AS keyPreview 
FROM session_keys
```
✅ 包含 proxy 字段

**admin.ts (批量检测)**
```typescript
SELECT `id`, `sessionKey`, `anonymousId`, `deviceId`, `routingHint`, 
       `cfBm`, `cfUvid`, `proxy` 
FROM `session_keys` 
WHERE `isActive` = TRUE
```
✅ 包含 proxy 字段

## 结论

✅ **所有字段定义与代码使用一致**
✅ **proxy 字段已通过迁移 006 添加**
✅ **没有发现遗漏或不一致的字段**

## 迁移文件执行顺序

1. 001_create_activation_codes.sql
2. 002_create_usage_logs.sql
3. 003_create_session_keys.sql (基础 8 个字段)
4. 004_add_activation_code_to_session_keys.sql (+1 字段)
5. 005_extend_session_keys_full_info.sql (+9 字段)
6. 006_add_proxy_to_session_keys.sql (+1 字段)

**总计：** 18 个字段 ✅

## 部署验证步骤

1. 拉取最新代码：`git pull origin main`
2. 重启 Docker：`docker-compose down && docker-compose up -d --build`
3. 查看迁移日志：`docker-compose logs backend | grep migrate`
4. 验证表结构：执行 verify-schema.sql

## 常见问题

**Q: 新环境部署报错 "Unknown column 'proxy'"**
A: 说明迁移文件 006 没有执行，检查：
   - 迁移文件是否存在：`ls backend/src/database/migrations/006*.sql`
   - Docker 容器是否重启：`docker-compose restart backend`
   - 查看迁移日志：`docker-compose logs backend | grep 006`

**Q: 如何手动添加 proxy 字段**
A: 连接数据库执行：
```sql
ALTER TABLE `session_keys`
  ADD COLUMN `proxy` VARCHAR(255) NULL COMMENT '代理地址' AFTER `cfUvid`;
```
