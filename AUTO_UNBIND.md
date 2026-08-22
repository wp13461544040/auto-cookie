# SessionKey 自动解绑功能说明

## 功能概述

为了防止 SessionKey 被长期占用,系统会自动解绑超过指定时间未使用的 SessionKey,使其重新回到可用库存。

## 配置方法

在 `backend/.env` 文件中配置:

```bash
# SessionKey 自动解绑时间（小时），默认 8 小时
AUTO_UNBIND_HOURS=8
```

**配置说明:**
- `AUTO_UNBIND_HOURS=8` - SessionKey 在绑定后 8 小时未使用会自动解绑
- `AUTO_UNBIND_HOURS=24` - 24 小时后解绑
- `AUTO_UNBIND_HOURS=0` - 禁用自动解绑功能

## 工作原理

### 1. SessionKey 绑定
当用户使用激活码切换账号时:
- 系统从库存中分配一个 SessionKey
- 该 SessionKey 绑定到激活码
- 记录 `lastUsedAt` 时间戳

### 2. 自动解绑检查
系统每小时执行一次检查:
- 查找 `lastUsedAt` 超过配置时间的 SessionKey
- 将其 `isActive` 设为 FALSE
- 清除 `activationCode` 绑定
- 该 SessionKey 重新回到可用库存

### 3. 日志输出
```
[AutoUnbind] 开始检查解绑任务... (超过 8 小时未使用)
[AutoUnbind] 找到 3 个需要解绑的 session_keys
[AutoUnbind] ✓ 成功解绑 3 个 session_keys
[AutoUnbind]   - sk-ant-sid01-xxx... (激活码: ABCD-1234, 最后使用: 9小时前)
```

## 库存不足提示

当所有 SessionKey 都被占用时,用户会看到友好提示:

```
❌ 当前没有可用的账号库存

可能原因:
· 所有账号都已被使用
· 等待账号自动解绑（8小时后）

请稍后重试或联系管理员
```

## 数据库字段说明

`session_keys` 表相关字段:
- `activationCode` - 绑定的激活码 (NULL 表示未绑定)
- `isActive` - 是否激活状态
- `lastUsedAt` - 最后使用时间
- `usedCount` - 使用次数

## 管理员操作

### 查看绑定状态
```sql
SELECT 
  sessionKey,
  activationCode,
  isActive,
  lastUsedAt,
  TIMESTAMPDIFF(HOUR, lastUsedAt, NOW()) as hoursAgo
FROM session_keys
WHERE isActive = TRUE AND activationCode IS NOT NULL
ORDER BY lastUsedAt DESC;
```

### 手动解绑
```sql
-- 解绑特定 SessionKey
UPDATE session_keys 
SET isActive = FALSE, activationCode = NULL 
WHERE sessionKey = 'sk-ant-sid01-xxx';

-- 解绑所有超过 24 小时的
UPDATE session_keys 
SET isActive = FALSE, activationCode = NULL 
WHERE isActive = TRUE 
  AND activationCode IS NOT NULL 
  AND lastUsedAt < DATE_SUB(NOW(), INTERVAL 24 HOUR);
```

### 查看可用库存
```sql
SELECT COUNT(*) as available
FROM session_keys
WHERE (activationCode IS NULL OR isActive = FALSE)
  AND (lastCheckStatus IS NULL OR lastCheckStatus != 'expired');
```

## 注意事项

1. **首次启动**: 系统启动时会立即执行一次解绑检查
2. **定时执行**: 之后每小时自动检查一次
3. **时区问题**: 使用数据库服务器时区,请确保配置正确
4. **性能影响**: 定时任务执行速度快,对系统影响极小

## 最佳实践

### 推荐配置
```bash
# 开发环境: 1 小时快速回收
AUTO_UNBIND_HOURS=1

# 生产环境: 8 小时平衡
AUTO_UNBIND_HOURS=8

# 长期使用: 24 小时
AUTO_UNBIND_HOURS=24
```

### 监控建议
定期检查日志文件,确保自动解绑正常运行:
```bash
docker compose logs backend | grep AutoUnbind
```

## 故障排查

### 问题: 自动解绑没有执行
**检查步骤:**
1. 确认 `AUTO_UNBIND_HOURS > 0`
2. 查看启动日志是否有错误
3. 检查数据库连接是否正常

### 问题: 库存仍然不足
**可能原因:**
1. 所有 SessionKey 都在时间范围内
2. SessionKey 被标记为 expired
3. 需要导入更多 SessionKey

**解决方法:**
```bash
# 查看 expired 状态的 key
SELECT COUNT(*) FROM session_keys WHERE lastCheckStatus = 'expired';

# 重置 expired 状态(谨慎操作)
UPDATE session_keys SET lastCheckStatus = NULL WHERE lastCheckStatus = 'expired';
```

## 版本历史

- **v1.0** - 初始版本,支持基本自动解绑功能
- 默认 8 小时自动解绑
- 每小时执行一次检查
- 友好的库存不足提示
