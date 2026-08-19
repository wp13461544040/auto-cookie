#!/bin/bash
set -e

echo "=================================="
echo "Auto-Cookie 服务器部署脚本"
echo "=================================="

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查是否为 root
if [ "$EUID" -ne 0 ]; then 
    log_error "请使用 root 权限运行: sudo bash deploy.sh"
    exit 1
fi

# 检查是否在 auto-cookie 目录中
if [ "$(basename $(pwd))" = "auto-cookie" ]; then
    log_warn "检测到已在 auto-cookie 目录中"
    DEPLOY_DIR=$(pwd)
else
    # 检查当前目录是否存在 auto-cookie
    if [ -d "auto-cookie" ]; then
        log_warn "检测到已存在 auto-cookie 目录，清理中..."
        cd auto-cookie
        docker-compose down 2>/dev/null || true
        cd ..
        rm -rf auto-cookie
        log_info "旧目录已清理"
    fi
    
    # 克隆项目
    log_info "克隆项目..."
    git clone https://github.com/wp13461544040/auto-cookie.git
    DEPLOY_DIR="$(pwd)/auto-cookie"
    cd auto-cookie
fi

# 1. 更新系统
log_info "更新系统包..."
apt update

# 2. 安装 Docker
if ! command -v docker &> /dev/null; then
    log_info "安装 Docker..."
    apt install -y apt-transport-https ca-certificates curl software-properties-common
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -
    add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
    apt update
    apt install -y docker-ce docker-ce-cli containerd.io
    systemctl enable docker
    systemctl start docker
    log_info "Docker 安装完成"
else
    log_info "Docker 已安装，跳过"
fi

# 3. 安装 Docker Compose
if ! command -v docker-compose &> /dev/null; then
    log_info "安装 Docker Compose..."
    
    # 尝试多个下载源
    COMPOSE_VERSION="v2.24.5"
    COMPOSE_FILE="/usr/local/bin/docker-compose"
    
    # 方法1: 使用 DaoCloud 镜像（国内）
    log_info "尝试从 DaoCloud 镜像下载..."
    if curl -L --connect-timeout 10 --max-time 120 \
        "https://get.daocloud.io/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" \
        -o "$COMPOSE_FILE" 2>/dev/null; then
        log_info "DaoCloud 下载成功"
    else
        # 方法2: 使用 GitHub 镜像
        log_info "DaoCloud 失败，尝试 GitHub 镜像..."
        if curl -L --connect-timeout 10 --max-time 120 \
            "https://mirror.ghproxy.com/https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" \
            -o "$COMPOSE_FILE" 2>/dev/null; then
            log_info "GitHub 镜像下载成功"
        else
            # 方法3: 使用 pip 安装
            log_warn "镜像下载失败，尝试使用 pip 安装..."
            apt install -y python3-pip
            pip3 install docker-compose
            log_info "通过 pip 安装完成"
        fi
    fi
    
    # 如果下载成功，设置权限
    if [ -f "$COMPOSE_FILE" ]; then
        chmod +x "$COMPOSE_FILE"
        ln -sf "$COMPOSE_FILE" /usr/bin/docker-compose
    fi
    
    # 验证安装
    if command -v docker-compose &> /dev/null; then
        log_info "Docker Compose 安装完成: $(docker-compose version --short 2>/dev/null || echo 'version unknown')"
    else
        log_error "Docker Compose 安装失败"
        exit 1
    fi
else
    log_info "Docker Compose 已安装，跳过"
fi

# 4. 安装 Node.js（用于构建）
if ! command -v node &> /dev/null; then
    log_info "安装 Node.js 18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
    log_info "Node.js 安装完成: $(node -v)"
else
    log_info "Node.js 已安装: $(node -v)"
fi

# 5. 确保在正确的目录
cd "$DEPLOY_DIR"

# 6. 检查环境变量文件
if [ ! -f .env ]; then
    log_warn ".env 文件不存在，创建默认配置..."
    cat > .env << 'EOF'
DB_NAME=claude_switcher
DB_USER=dev
DB_PASSWORD=dev123
DB_ROOT_PASSWORD=root123
EOF
fi

# 7. 构建后端代码
log_info "构建后端项目..."
cd backend

if [ ! -d "node_modules" ]; then
    log_info "安装依赖..."
    npm install
fi

log_info "编译 TypeScript..."
npm run build

cd ..

# 8. 启动 Docker 容器
log_info "启动 Docker 服务..."
docker-compose down 2>/dev/null || true
docker-compose up -d --build

# 9. 等待数据库启动
log_info "等待数据库启动..."
sleep 15

# 10. 运行数据库迁移
log_info "运行数据库迁移..."
docker-compose exec -T backend npm run migrate || {
    log_warn "自动迁移失败，尝试手动迁移..."
    docker-compose exec -T backend node -e "
    const mysql = require('mysql2/promise');
    const fs = require('fs');
    const path = require('path');
    
    async function migrate() {
      const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true
      });
      
      const migrations = fs.readdirSync('/app/dist/database/migrations')
        .filter(f => f.endsWith('.sql'))
        .sort();
      
      for (const file of migrations) {
        const sql = fs.readFileSync(path.join('/app/dist/database/migrations', file), 'utf8');
        await connection.query(sql);
        console.log('Executed:', file);
      }
      
      await connection.end();
    }
    
    migrate().catch(console.error);
    "
}

# 11. 检查服务状态
log_info "检查服务状态..."
docker-compose ps

# 12. 显示日志
log_info "最近日志："
docker-compose logs --tail=20

echo ""
echo "=================================="
log_info "部署完成！"
echo "=================================="
echo ""
echo "服务地址: http://$(hostname -I | awk '{print $1}'):3000"
echo "管理界面: http://$(hostname -I | awk '{print $1}'):3000/admin.html"
echo ""
echo "常用命令："
echo "  查看日志: docker-compose logs -f"
echo "  重启服务: docker-compose restart"
echo "  停止服务: docker-compose down"
echo "  查看状态: docker-compose ps"
echo ""
