#!/bin/bash
# 极简部署脚本 - 适用于国内服务器

set -e

echo "=== Auto-Cookie 快速部署 ==="

# 检查并清理旧目录
if [ "$(basename $(pwd))" != "auto-cookie" ]; then
    if [ -d "auto-cookie" ]; then
        echo "清理旧目录..."
        cd auto-cookie && docker-compose down 2>/dev/null || true
        cd .. && rm -rf auto-cookie
    fi
    echo "克隆项目..."
    git clone https://github.com/wp13461544040/auto-cookie.git
    cd auto-cookie
fi

# 1. 安装 Docker
if ! command -v docker &> /dev/null; then
    echo "安装 Docker..."
    curl -fsSL https://get.docker.com | bash -s docker --mirror Aliyun
    systemctl enable docker && systemctl start docker
fi

# 2. 安装 Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "安装 Docker Compose..."
    curl -L https://get.daocloud.io/docker/compose/releases/download/v2.24.5/docker-compose-$(uname -s)-$(uname -m) -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# 3. 安装 Node.js
if ! command -v node &> /dev/null; then
    echo "安装 Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
fi

# 4. 构建项目
echo "构建后端..."
cd backend
npm config set registry https://registry.npmmirror.com
npm install
npm run build
cd ..

# 5. 启动服务
echo "启动服务..."
docker-compose up -d --build

# 6. 等待并迁移
echo "等待数据库启动..."
sleep 20
docker-compose exec -T backend npm run migrate || echo "迁移失败，请手动执行"

echo ""
echo "=== 部署完成 ==="
echo "访问地址: http://$(hostname -I | awk '{print $1}'):3000"
echo "查看日志: docker-compose logs -f"
