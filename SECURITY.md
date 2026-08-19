# 🔒 安全配置指南

## 安全措施说明

本系统实现了以下安全防护：

### 1. 管理员令牌认证 (Admin Token)

所有管理接口 (`/admin/*`) 都需要提供有效的管理员令牌才能访问。

**配置方法：**

1. 生成安全的随机令牌：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

2. 在 `backend/.env` 文件中设置：
```env
ADMIN_TOKEN=你生成的64位十六进制字符串
```

3. 重启后端服务

**前端使用：**
- 首次访问管理后台会提示登录
- 输入 `ADMIN_TOKEN` 的值
- 令牌会保存在浏览器 localStorage 中
- 点击"登出"按钮可清除令牌

### 2. IP 白名单 (IP Whitelist)

限制只有特定 IP 地址才能访问管理接口。

**配置方法：**

在 `backend/.env` 文件中设置：
```env
# 只允许本机访问
ADMIN_ALLOWED_IPS=127.0.0.1,::1

# 允许多个 IP
ADMIN_ALLOWED_IPS=127.0.0.1,192.168.1.100,10.0.0.50

# 留空则不限制（不推荐）
ADMIN_ALLOWED_IPS=
```

### 3. 安全最佳实践

#### ✅ 推荐做法

1. **使用强令牌**
   - 使用至少 32 字节随机生成的令牌
   - 不要使用简单密码如 "admin123"

2. **限制访问来源**
   - 生产环境必须设置 IP 白名单
   - 只允许管理员的 IP 地址

3. **HTTPS 部署**
   - 生产环境使用 HTTPS
   - 配置 TLS 证书：
     ```env
     TLS_KEY_PATH=/path/to/key.pem
     TLS_CERT_PATH=/path/to/cert.pem
     ```

4. **定期更换令牌**
   - 建议每月更换一次 ADMIN_TOKEN
   - 更换后通知所有管理员

5. **日志监控**
   - 检查后端日志中的 `[SECURITY]` 警告
   - 发现异常访问及时处理

#### ❌ 不安全做法

1. ❌ 不设置 ADMIN_TOKEN（开发环境会警告）
2. ❌ 使用简单令牌如 "123456"
3. ❌ 将 ADMIN_TOKEN 提交到 Git 仓库
4. ❌ 在公网暴露管理接口而不设置白名单
5. ❌ 使用 HTTP 传输（生产环境）

## 风险等级

### 🟢 低风险 - 已防护

| 攻击类型 | 防护措施 |
|---------|---------|
| 未授权访问 | ✅ Token 认证 |
| 恶意 IP 访问 | ✅ IP 白名单 |
| 暴力破解 | ✅ 复杂令牌 (2^256 种可能) |

### 🟡 中风险 - 需配置

| 风险 | 解决方案 |
|-----|---------|
| 令牌泄露 | 定期更换 + 限制 IP |
| 中间人攻击 | 启用 HTTPS (TLS) |

### 🔴 高风险 - 必须避免

| 场景 | 严重性 |
|-----|--------|
| 不设置 ADMIN_TOKEN | 🚨 任何人可管理 |
| HTTP + 公网暴露 | 🚨 令牌明文传输 |
| 弱令牌 (如123456) | 🚨 易被猜测 |

## 部署检查清单

### 开发环境
- [ ] 可以不设置 ADMIN_TOKEN（会有警告）
- [ ] IP 限制: `127.0.0.1,::1`

### 生产环境
- [ ] **必须**设置强 ADMIN_TOKEN
- [ ] **必须**设置 IP 白名单
- [ ] **强烈推荐**启用 HTTPS
- [ ] 定期检查访问日志
- [ ] 定期更换令牌

## 如何生成强令牌

### 方法 1: Node.js
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 方法 2: OpenSSL
```bash
openssl rand -hex 32
```

### 方法 3: Python
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

## 示例配置

### 开发环境 (.env)
```env
# 开发环境可以不设置（会警告）
ADMIN_TOKEN=

# 只允许本机
ADMIN_ALLOWED_IPS=127.0.0.1,::1
```

### 生产环境 (.env)
```env
# 生产环境必须设置
ADMIN_TOKEN=a1b2c3d4e5f6...64位十六进制

# 限制管理员 IP
ADMIN_ALLOWED_IPS=203.0.113.10,203.0.113.20

# 启用 HTTPS
TLS_KEY_PATH=/etc/ssl/private/server.key
TLS_CERT_PATH=/etc/ssl/certs/server.crt
HTTPS_PORT=3443
```

## 监控建议

查看安全日志：
```bash
# 查看被拦截的访问
cat logs/app.log | grep "\[SECURITY\]"

# 查看认证失败
cat logs/app.log | grep "401\|403"
```

## 应急响应

### 如果令牌泄露：

1. **立即更换令牌**
   ```bash
   # 生成新令牌
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   
   # 更新 .env
   ADMIN_TOKEN=新令牌
   
   # 重启服务
   pm2 restart backend
   ```

2. **检查日志**
   ```bash
   # 查看最近的管理操作
   tail -100 logs/app.log | grep "/admin"
   ```

3. **通知管理员**
   - 告知新令牌
   - 说明泄露原因
   - 加强安全措施

## 技术实现

### 认证流程

```
客户端请求 → IP 白名单检查 → Token 验证 → 执行操作
     ↓              ↓              ↓
   403禁止      403禁止        401未授权
```

### 令牌存储

- 后端: 环境变量 `ADMIN_TOKEN`
- 前端: `localStorage.adminToken`
- 传输: HTTP Header `Authorization: Bearer <token>`

## 常见问题

### Q: 忘记了 ADMIN_TOKEN 怎么办？
A: 查看服务器上的 `backend/.env` 文件，或生成新的令牌替换。

### Q: 如何多人管理？
A: 所有管理员共享同一个 ADMIN_TOKEN，或为每个管理员设置独立的 IP 白名单。

### Q: Token 会过期吗？
A: 不会自动过期，但建议定期手动更换（如每月一次）。

### Q: 可以用用户名密码吗？
A: 当前使用 Token 认证更简单安全。如需用户系统，建议使用 JWT + 数据库存储。

## 联系方式

如发现安全漏洞，请负责任地披露：
- 不要公开披露未修复的漏洞
- 直接联系项目维护者
- 提供详细的复现步骤
