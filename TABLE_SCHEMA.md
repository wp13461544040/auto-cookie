# 数据库表结构文档

## 1. activation_codes（激活码表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 主键 |
| code | VARCHAR(50) | NOT NULL, UNIQUE | 激活码 |
| maxUses | INT | NOT NULL | 最大使用次数 |
| usedCount | INT | NOT NULL DEFAULT 0 | 已使用次数 |
| expiryDate | DATETIME | NOT NULL | 过期时间 |
| isActive | BOOLEAN | NOT NULL DEFAULT TRUE | 是否激活 |
| createdAt | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| lastUsedAt | DATETIME | NULL | 最后使用时间 |

**索引：**
- PRIMARY KEY (id)
- UNIQUE KEY (code)
- KEY (isActive)
- KEY (expiryDate)
- KEY (isActive, expiryDate)

---

## 2. session_keys（SessionKey 表）

| 字段名 | 类型 | 约束 | 说明 | 来源迁移 |
|--------|------|------|------|----------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 主键 | 003 |
| activationCode | VARCHAR(50) | NULL | 绑定的激活码 | 004 |
| sessionKey | TEXT | NOT NULL | Session Key | 003 |
| label | VARCHAR(100) | NULL | 备注标签 | 003 |
| email | VARCHAR(255) | NULL | 账号邮箱 | 005 |
| uuid | VARCHAR(50) | NULL | 账号 UUID | 005 |
| anonymousId | VARCHAR(100) | NULL | 匿名 ID | 005 |
| deviceId | VARCHAR(100) | NULL | 设备 ID | 005 |
| routingHint | TEXT | NULL | 路由提示 | 005 |
| cfBm | TEXT | NULL | Cloudflare __cf_bm cookie | 005 |
| cfUvid | TEXT | NULL | Cloudflare _cfuvid cookie | 005 |
| proxy | VARCHAR(255) | NULL | 代理地址 | 006 |
| lastCheckStatus | ENUM('healthy', 'expired', 'error', 'unknown') | DEFAULT 'unknown' | 最后检测状态 | 005 |
| lastCheckedAt | DATETIME | NULL | 最后检测时间 | 005 |
| isActive | BOOLEAN | NOT NULL DEFAULT TRUE | 是否激活 | 003 |
| createdAt | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | 创建时间 | 003 |
| lastUsedAt | DATETIME | NULL | 最后使用时间 | 003 |
| usedCount | INT | NOT NULL DEFAULT 0 | 使用次数 | 003 |

**索引：**
- PRIMARY KEY (id)
- KEY (activationCode, isActive)
- KEY (email)
- KEY (uuid)
- KEY (isActive)

---

## 3. usage_logs（使用日志表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 主键 |
| activationCode | VARCHAR(50) | NOT NULL, FOREIGN KEY | 激活码 |
| usedAt | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | 使用时间 |
| ipAddress | VARCHAR(45) | NOT NULL | IP 地址 |
| userAgent | TEXT | NOT NULL | User Agent |
| success | BOOLEAN | NOT NULL | 是否成功 |
| errorReason | VARCHAR(100) | NULL | 错误原因 |

**索引：**
- PRIMARY KEY (id)
- KEY (activationCode)
- KEY (usedAt)
- FOREIGN KEY (activationCode) REFERENCES activation_codes(code)

---

## 迁移文件顺序

1. `001_create_activation_codes.sql` - 创建激活码表
2. `002_create_usage_logs.sql` - 创建使用日志表
3. `003_create_session_keys.sql` - 创建 SessionKey 表（基础字段）
4. `004_add_activation_code_to_session_keys.sql` - 添加激活码关联
5. `005_extend_session_keys_full_info.sql` - 扩展完整账号信息字段
6. `006_add_proxy_to_session_keys.sql` - 添加代理字段
