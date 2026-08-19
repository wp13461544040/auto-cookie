# Auto-Cookie 部署指南

## 快速部署（推荐）

### 一键部署

```bash
# 下载并运行部署脚本
wget https://raw.githubusercontent.com/wp13461544040/auto-cookie/main/deploy.sh
sudo bash deploy.sh
```

或者手动克隆后部署：

```bash
# 克隆项目
git clone https://github.com/wp13461544040/auto-cookie.git
cd auto-cookie

# 运行部署脚本
sudo bash deploy.sh
```

**脚本会自动处理：**
- ✅ Docker 和 Docker Compose 安装
- ✅ Node.js 18 环境配置
- ✅ 国内镜像源配置（npm、Docker）
- ✅ 项目构建和数据库初始化
- ✅ 服务启动和健康检查

**部署时间：** 10-15 分钟（取决于网络速度）

---

## 系统要求

### 最低配置
- CPU: 1核
- 内存: 1GB
- 磁盘: 10GB
- 系统: Ubuntu 20.04+ / Debian 10+ / CentOS 7+

### 推荐配置
- CPU: 2核+
- 内存: 2GB+
- 磁盘: 20GB+

### 端口要求
- `3000` - HTTP 服务
- `3306` - MySQL（仅本地访问）

---

## 升级服务

### 自动升级

```bash
cd auto-cookie
sudo bash upgrade.sh
```

**升级流程：**
1. 自动备份配置文件
2. 拉取最新代码
3. 重新构建项目
4. 运行数据库迁移
5. 重启服务

### 手动升级

```bash
cd auto-cookie

# 1. 停止服务
docker compose down

# 2. 备份配置
cp .env .env.bak
cp backend/.env backend/.env.bak

# 3. 拉取代码
git pull

# 4. 重新构建
cd backend
npm install
npm run build
cd ..

# 5. 启动服务
docker compose up -d

# 6. 运行迁移
docker compose exec backend npm run migrate
```

---

## 常用运维命令

### 服务管理

```bash
# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f
docker compose logs -f backend
docker compose logs -f db

# 重启服务
docker compose restart

# 停止服务
docker compose down

# 完全清理（包括数据）
docker compose down -v
```

### 数据库操作

```bash
# 进入数据库
docker compose exec db mysql -uroot -p

# 备份数据库
docker compose exec db mysqldump -uroot -p claude_switcher > backup_$(date +%Y%m%d).sql

# 恢复数据库
docker compose exec -T db mysql -uroot -p claude_switcher < backup.sql

# 查看数据库日志
docker compose logs db
```

### 后端调试

```bash
# 查看后端容器日志
docker compose logs -f backend

# 进入后端容器
docker compose exec backend sh

# 重新构建后端
cd backend
npm run build
docker compose restart backend

# 查看编译后的代码
docker compose exec backend ls -la /app/dist
```

---

## 配置说明

### 环境变量（.env）

```env
# 数据库配置
DB_NAME=claude_switcher
DB_USER=dev
DB_PASSWORD=your_password_here
DB_ROOT_PASSWORD=your_root_password_here
```

### 后端配置（backend/.env）

```env
# 服务端口
PORT=3001
HTTPS_PORT=3443

# 数据库连接
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=claude_switcher
DB_USER=dev
DB_PASSWORD=your_password_here

# 运行环境
NODE_ENV=production

# 管理员配置
ADMIN_USERNAME=admin
ADMIN_PASSWORD=

# IP 白名单（生产环境必须配置）
ADMIN_ALLOWED_IPS=127.0.0.1,::1
```

---

## 生产环境优化

### 1. 使用 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 2. 配置 HTTPS

```bash
# 安装 Certbot
apt install -y certbot python3-certbot-nginx

# 获取证书
certbot --nginx -d your-domain.com

# 自动续期
certbot renew --dry-run
```

### 3. 配置防火墙

```bash
# 允许必要端口
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# 禁止直接访问 MySQL
ufw deny 3306/tcp
```

### 4. 定期备份

创建备份脚本 `/root/backup.sh`：

```bash
#!/bin/bash
BACKUP_DIR="/root/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# 备份数据库
docker compose exec -T db mysqldump -uroot -proot123 claude_switcher > $BACKUP_DIR/db_$DATE.sql

# 备份配置
cp .env $BACKUP_DIR/env_$DATE
cp backend/.env $BACKUP_DIR/backend_env_$DATE

# 清理 7 天前的备份
find $BACKUP_DIR -type f -mtime +7 -delete

echo "备份完成: $BACKUP_DIR"
```

添加定时任务：

```bash
# 编辑 crontab
crontab -e

# 每天凌晨 2 点备份
0 2 * * * /root/backup.sh
```

---

## 故障排查

### 后端容器重启循环

```bash
# 查看详细日志
docker compose logs --tail=100 backend

# 常见原因：
# 1. 数据库连接失败 → 检查 DB_HOST、DB_PASSWORD
# 2. 代码编译错误 → 重新构建
# 3. 端口被占用 → 修改 PORT 配置
```

### 数据库连接失败

```bash
# 检查数据库状态
docker compose ps db

# 测试连接
docker compose exec backend ping db

# 检查密码是否正确
docker compose exec db mysql -udev -p

# 查看数据库日志
docker compose logs db
```

### 前端无法访问

```bash
# 检查服务状态
docker compose ps

# 检查端口监听
netstat -tlnp | grep 3000

# 检查防火墙
ufw status
```

### 性能问题

```bash
# 查看容器资源使用
docker stats

# 查看系统资源
top
df -h
free -h

# 清理 Docker 垃圾
docker system prune -a
```

---

## 国产服务器适配

脚本已针对以下环境优化：

### ✅ 阿里云
- 自动使用阿里云镜像源
- Docker 镜像加速配置
- npm 淘宝镜像

### ✅ 腾讯云
- 腾讯云镜像源支持
- 网络优化配置

### ✅ 华为云
- 华为云镜像适配
- 防火墙规则配置

### ✅ 其他服务商
- 自动检测最佳镜像源
- 备用下载地址
- 离线部署支持

---

## 安全建议

1. **修改默认密码**
   - 数据库 root 密码
   - 数据库用户密码
   - 管理员密码

2. **配置 IP 白名单**
   ```env
   ADMIN_ALLOWED_IPS=your.ip.address
   ```

3. **使用 HTTPS**
   - 生产环境必须启用
   - 定期更新证书

4. **定期更新**
   ```bash
   sudo bash upgrade.sh
   ```

5. **监控日志**
   ```bash
   docker compose logs -f | grep -i error
   ```

---

## 技术支持

- 项目地址: https://github.com/wp13461544040/auto-cookie
- 问题反馈: https://github.com/wp13461544040/auto-cookie/issues
- 文档: https://github.com/wp13461544040/auto-cookie/wiki

---

## 许可证

本项目采用 MIT 许可证
