# Proxy 字段修复指南

## 问题描述

错误信息：`Error: Unknown column 'proxy' in 'field list'`

**原因**：数据库迁移文件 `006_add_proxy_to_session_keys.sql` 未成功执行，导致 `session_keys` 表缺少 `proxy` 字段。

---

## 🚀 快速修复（推荐）

在服务器上执行：

```bash
cd /root/auto-cookie

# 方式 1：使用自动修复脚本（推荐）
bash backend/fix-proxy-field.sh

# 方式 2：一键命令
docker-compose exec -T db mysql -uroot -p$(grep DB_ROOT_PASSWORD .env | cut -d '=' -f 2 | tr -d ' "'"'"'') claude_switcher -e "ALTER TABLE session_keys ADD COLUMN proxy VARCHAR(255) NULL;" && docker-compose restart backend
```

---

## 📋 手动修复步骤

### 1. 进入数据库

```bash
cd /root/auto-cookie

# 查看数据库密码
grep DB_ROOT_PASSWORD .env

# 进入数据库容器
docker-compose exec db mysql -uroot -p
# 输入上面看到的密码
```

### 2. 执行 SQL

```sql
USE claude_switcher;

-- 添加 proxy 字段
ALTER TABLE session_keys 
  ADD COLUMN proxy VARCHAR(255) NULL 
  COMMENT '代理地址' 
  AFTER cfUvid;

-- 验证字段
SHOW COLUMNS FROM session_keys LIKE 'proxy';

-- 查看完整表结构
DESCRIBE session_keys;

EXIT;
```

### 3. 重启后端

```bash
docker-compose restart backend
```

---

## ✅ 验证修复

### 1. 检查字段是否存在

```bash
cd /root/auto-cookie

docker-compose exec -T db mysql -uroot -p$(grep DB_ROOT_PASSWORD .env | cut -d '=' -f 2 | tr -d ' "'"'"'') claude_switcher -e "SHOW COLUMNS FROM session_keys LIKE 'proxy';"
```

**预期输出：**
```
Field   Type         Null  Key  Default  Extra
proxy   varchar(255) YES        NULL
```

### 2. 检查后端日志

```bash
docker-compose logs -f backend
```

应该没有 "Unknown column 'proxy'" 错误。

### 3. 测试功能

1. 访问后台管理页面：`http://你的域名/admin.html`
2. 添加/编辑账号
3. 使用插件切换账号

---

## 🔍 为什么迁移失败？

可能的原因：

1. **首次部署时迁移已失败**
   - `npm run migrate` 可能在某个步骤就停止了
   - 只执行了部分迁移文件（001-005），006 未执行

2. **数据库连接问题**
   - 迁移时数据库未就绪
   - 连接超时

3. **SQL 语法问题**
   - 但 006 的 SQL 是正确的，应该不是这个原因

---

## 📊 完整表结构

修复后，`session_keys` 表应该有 **18 个字段**：

```sql
id                  INT PRIMARY KEY AUTO_INCREMENT
activationCode      VARCHAR(20) NOT NULL
sessionKey          TEXT NOT NULL
label               VARCHAR(100)
email               VARCHAR(100)
uuid                VARCHAR(100)
anonymousId         VARCHAR(100)
deviceId            VARCHAR(100)
routingHint         VARCHAR(100)
cfBm                TEXT
cfUvid              TEXT
proxy               VARCHAR(255)    -- ← 新增字段
lastCheckStatus     VARCHAR(20)
lastCheckedAt       DATETIME
isActive            TINYINT(1) DEFAULT 1
createdAt           DATETIME DEFAULT CURRENT_TIMESTAMP
lastUsedAt          DATETIME
usedCount           INT DEFAULT 0
```

---

## 🆘 还是不行？

如果修复后仍报错，请检查：

1. **确认字段已添加**
   ```bash
   docker-compose exec db mysql -uroot -p
   USE claude_switcher;
   DESCRIBE session_keys;
   ```
   应该能看到 `proxy` 字段。

2. **确认后端已重启**
   ```bash
   docker-compose restart backend
   docker-compose ps
   ```
   backend 应该是 `Up` 状态。

3. **清除浏览器缓存**
   - 强制刷新页面（Ctrl+F5）
   - 或清除浏览器缓存

4. **检查后端代码**
   ```bash
   grep -r "INSERT INTO.*session_keys" backend/src/
   ```
   确认所有 INSERT 语句的字段数与表结构匹配。

---

## 📝 预防措施

为避免未来类似问题：

1. **部署前检查迁移**
   ```bash
   npm run migrate
   # 确保所有迁移文件都执行成功
   ```

2. **手动验证表结构**
   ```bash
   docker-compose exec db mysql -uroot -p claude_switcher -e "SHOW TABLES;"
   docker-compose exec db mysql -uroot -p claude_switcher -e "DESCRIBE session_keys;"
   ```

3. **保存数据库备份**
   ```bash
   docker-compose exec db mysqldump -uroot -p claude_switcher > backup.sql
   ```

---

## 联系方式

如需进一步帮助，请提供：

1. 错误日志：`docker-compose logs backend | tail -n 50`
2. 数据库状态：`docker-compose exec db mysql -uroot -p claude_switcher -e "SHOW TABLES;"`
3. 表结构：`docker-compose exec db mysql -uroot -p claude_switcher -e "DESCRIBE session_keys;"`
