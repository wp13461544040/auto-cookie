# 数据库迁移失败修复指南

## 问题描述
部署时出现：`[!] 自动迁移失败，请手动检查`

这通常是因为 `proxy` 字段迁移失败。

---

## 解决方案

### 方式 1：使用修复脚本（推荐）

**上传脚本到服务器：**
```bash
scp fix-migration.sh root@你的服务器IP:/root/
```

**在服务器上执行：**
```bash
ssh root@你的服务器IP
cd /root/auto-cookie
bash /root/fix-migration.sh
```

---

### 方式 2：一键命令（最简单）

**复制以下命令，在服务器上执行：**

```bash
cd /root/auto-cookie && \
docker-compose exec -T db mysql -uroot -p"${DB_ROOT_PASSWORD}" claude_switcher -e "
ALTER TABLE \`session_keys\`
  ADD COLUMN IF NOT EXISTS \`proxy\` VARCHAR(255) NULL COMMENT '代理地址' AFTER \`cfUvid\`;
" && \
echo "✓ proxy 字段已添加" && \
docker-compose restart backend
```

**注意：** 如果提示 `IF NOT EXISTS` 语法错误，使用下面的版本：

```bash
cd /root/auto-cookie && \
docker-compose exec -T db mysql -uroot -p"${DB_ROOT_PASSWORD}" claude_switcher -e "
SET @column_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'claude_switcher' AND TABLE_NAME = 'session_keys' AND COLUMN_NAME = 'proxy');
SET @sql = IF(@column_exists = 0, 'ALTER TABLE \`session_keys\` ADD COLUMN \`proxy\` VARCHAR(255) NULL COMMENT \"代理地址\" AFTER \`cfUvid\`', 'SELECT \"proxy已存在\"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
" && \
docker-compose restart backend
```

---

### 方式 3：手动进入数据库

```bash
# 1. 进入数据库容器
cd /root/auto-cookie
docker-compose exec db mysql -uroot -p

# 2. 输入密码后，执行以下 SQL
USE claude_switcher;

ALTER TABLE `session_keys`
  ADD COLUMN `proxy` VARCHAR(255) NULL COMMENT '代理地址' AFTER `cfUvid`;

# 3. 验证字段已添加
DESCRIBE session_keys;

# 4. 退出数据库
EXIT;

# 5. 重启后端
docker-compose restart backend
```

---

### 方式 4：使用 SQL 文件

```bash
# 1. 上传 manual-migration.sql 到服务器
scp manual-migration.sql root@你的服务器IP:/root/

# 2. 在服务器上执行
cd /root/auto-cookie
docker-compose exec -T db mysql -uroot -p"${DB_ROOT_PASSWORD}" < /root/manual-migration.sql

# 3. 重启后端
docker-compose restart backend
```

---

## 验证修复成功

```bash
# 检查 proxy 字段是否存在
cd /root/auto-cookie
docker-compose exec db mysql -uroot -p"${DB_ROOT_PASSWORD}" claude_switcher -e "
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'claude_switcher' 
  AND TABLE_NAME = 'session_keys' 
  AND COLUMN_NAME = 'proxy';
"
```

**期望输出：**
```
COLUMN_NAME  DATA_TYPE    IS_NULLABLE
proxy        varchar      YES
```

如果有输出，说明字段已成功添加！

---

## 查看服务状态

```bash
cd /root/auto-cookie

# 查看容器状态
docker-compose ps

# 查看后端日志
docker-compose logs backend --tail=50

# 测试健康检查
curl http://localhost:5000/health
```

---

## 常见错误

### 错误 1：`Column 'proxy' specified twice`
**原因：** proxy 字段已存在
**解决：** 不需要操作，字段已经存在

### 错误 2：`Access denied`
**原因：** 数据库密码错误
**解决：** 检查 `.env` 文件中的 `DB_ROOT_PASSWORD`

### 错误 3：`Unknown database 'claude_switcher'`
**原因：** 数据库未创建
**解决：** 
```bash
docker-compose exec db mysql -uroot -p"${DB_ROOT_PASSWORD}" -e "CREATE DATABASE IF NOT EXISTS claude_switcher;"
```

---

## 预防措施

为避免将来出现类似问题，建议：

1. **使用 Docker Volume 持久化数据**
   - 数据库数据已持久化在 `db-data` volume 中
   
2. **备份数据库**
   ```bash
   docker-compose exec db mysqldump -uroot -p"${DB_ROOT_PASSWORD}" claude_switcher > backup.sql
   ```

3. **测试迁移**
   ```bash
   # 在测试环境先执行
   docker-compose exec backend npm run migrate
   ```
