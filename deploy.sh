#!/bin/bash
# Auto-Cookie 一键部署脚本
# 适配国产服务器环境（阿里云、腾讯云、华为云等）
# 自动处理网络问题、依赖安装、镜像源配置

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }
log_step() { echo -e "${BLUE}[→]${NC} $1"; }

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then 
    log_error "请使用 root 权限运行: sudo bash deploy.sh"
    exit 1
fi

echo "========================================"
echo "  Auto-Cookie 自动部署脚本"
echo "  适配国产服务器环境"
echo "========================================"
echo ""

# 检测部署目录
if [ "$(basename $(pwd))" = "auto-cookie" ]; then
    DEPLOY_DIR=$(pwd)
    log_info "检测到当前在项目目录"
else
    if [ -d "auto-cookie" ]; then
        log_warn "检测到已存在项目目录，将重新部署"
        cd auto-cookie
        docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
        cd ..
        rm -rf auto-cookie
    fi
    
    log_step "克隆项目代码..."
    if ! git clone https://github.com/wp13461544040/auto-cookie.git 2>/dev/null; then
        log_warn "GitHub 连接失败，尝试使用 Gitee 镜像"
        git clone https://gitee.com/mirrors/auto-cookie.git 2>/dev/null || {
            log_error "代码克隆失败，请检查网络或手动下载"
            exit 1
        }
    fi
    DEPLOY_DIR="$(pwd)/auto-cookie"
    cd auto-cookie
fi

log_info "部署目录: $DEPLOY_DIR"
echo ""

# ==================== 系统检测 ====================
log_step "检测系统环境..."

# 检测操作系统
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_NAME=$ID
    OS_VERSION=$VERSION_ID
    log_info "系统: $PRETTY_NAME"
else
    OS_NAME="unknown"
    log_warn "无法检测系统类型"
fi

# 更新软件源（使用国内镜像）
log_step "配置系统软件源..."
if [ "$OS_NAME" = "ubuntu" ] || [ "$OS_NAME" = "debian" ]; then
    # 备份原始源
    [ ! -f /etc/apt/sources.list.bak ] && cp /etc/apt/sources.list /etc/apt/sources.list.bak
    
    # 使用阿里云镜像
    if [ "$OS_NAME" = "ubuntu" ]; then
        cat > /etc/apt/sources.list << EOF
deb http://mirrors.aliyun.com/ubuntu/ $(lsb_release -cs) main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ $(lsb_release -cs)-updates main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ $(lsb_release -cs)-security main restricted universe multiverse
EOF
    fi
    
    apt update -qq
    log_info "软件源配置完成"
fi

# ==================== Docker 安装 ====================
if ! command -v docker &> /dev/null; then
    log_step "安装 Docker..."
    
    # 卸载旧版本
    apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
    
    # 安装依赖
    apt install -y apt-transport-https ca-certificates curl software-properties-common gnupg lsb-release
    
    # 使用阿里云镜像安装
    curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://mirrors.aliyun.com/docker-ce/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    apt update -qq
    apt install -y docker-ce docker-ce-cli containerd.io
    
    systemctl enable docker
    systemctl start docker
    
    log_info "Docker 安装完成: $(docker --version)"
else
    log_info "Docker 已安装: $(docker --version)"
fi

# 配置 Docker 国内镜像加速
log_step "配置 Docker 镜像加速..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json << 'EOF'
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.nju.edu.cn",
    "https://mirror.ccs.tencentyun.com",
    "https://registry.cn-hangzhou.aliyuncs.com"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "3"
  },
  "storage-driver": "overlay2"
}
EOF
systemctl daemon-reload
systemctl restart docker
log_info "Docker 镜像加速配置完成"

# ==================== Docker Compose 安装 ====================
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    log_step "安装 Docker Compose..."
    
    # 方法1: 使用 apt 安装插件版本
    if apt install -y docker-compose-plugin 2>/dev/null; then
        log_info "Docker Compose 插件安装成功"
        alias docker-compose="docker compose"
    else
        # 方法2: 下载二进制文件
        COMPOSE_VERSION="v2.24.5"
        COMPOSE_URL="https://mirrors.aliyun.com/docker-toolbox/linux/compose/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)"
        
        if curl -L --connect-timeout 10 --max-time 120 "$COMPOSE_URL" -o /usr/local/bin/docker-compose 2>/dev/null; then
            chmod +x /usr/local/bin/docker-compose
            log_info "Docker Compose 二进制安装成功"
        else
            log_error "Docker Compose 安装失败"
            exit 1
        fi
    fi
else
    log_info "Docker Compose 已安装"
fi

# 创建别名确保兼容
if docker compose version &> /dev/null; then
    echo 'alias docker-compose="docker compose"' >> ~/.bashrc 2>/dev/null || true
fi

# ==================== Node.js 安装 ====================

# 检查 Node.js 和 npm
check_nodejs() {
    if ! command -v node &> /dev/null; then
        return 1
    fi
    
    if ! command -v npm &> /dev/null; then
        return 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        return 1
    fi
    
    return 0
}

# 安装 Node.js v18
install_nodejs() {
    log_step "安装 Node.js v18..."
    
    # 卸载旧版本
    apt remove -y nodejs npm 2>/dev/null || true
    apt autoremove -y 2>/dev/null || true
    
    # 使用 fnm (Fast Node Manager) 安装
    if ! command -v fnm &> /dev/null; then
        log_step "安装 fnm..."
        curl -fsSL https://fnm.vercel.app/install | bash -s -- --skip-shell
        export PATH="$HOME/.local/share/fnm:$PATH"
        eval "$(fnm env --use-on-cd)" 2>/dev/null || true
    fi
    
    if command -v fnm &> /dev/null; then
        log_step "使用 fnm 安装 Node.js 18..."
        fnm install 18
        fnm use 18
        fnm default 18
        export PATH="$HOME/.local/share/fnm:$PATH"
        eval "$(fnm env)" 2>/dev/null || true
    else
        log_warn "fnm 安装失败，使用备用方案"
        
        # 方法2: 直接下载 Node.js 二进制
        log_step "直接下载 Node.js 二进制..."
        NODE_VERSION="18.20.5"
        NODE_DISTRO="linux-x64"
        NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${NODE_DISTRO}.tar.xz"
        NODE_MIRROR_URL="https://npmmirror.com/mirrors/node/v${NODE_VERSION}/node-v${NODE_VERSION}-${NODE_DISTRO}.tar.xz"
        
        cd /tmp
        if curl -fsSL --connect-timeout 10 --max-time 60 "$NODE_MIRROR_URL" -o node.tar.xz 2>/dev/null || \
           curl -fsSL --connect-timeout 10 --max-time 60 "$NODE_URL" -o node.tar.xz 2>/dev/null; then
            mkdir -p /usr/local/lib/nodejs
            tar -xJf node.tar.xz -C /usr/local/lib/nodejs
            ln -sf /usr/local/lib/nodejs/node-v${NODE_VERSION}-${NODE_DISTRO}/bin/node /usr/local/bin/node
            ln -sf /usr/local/lib/nodejs/node-v${NODE_VERSION}-${NODE_DISTRO}/bin/npm /usr/local/bin/npm
            ln -sf /usr/local/lib/nodejs/node-v${NODE_VERSION}-${NODE_DISTRO}/bin/npx /usr/local/bin/npx
            rm -f node.tar.xz
            cd "$DEPLOY_DIR"
            log_info "Node.js 安装完成"
        else
            log_error "Node.js 下载失败"
            return 1
        fi
    fi
    
    # 验证安装
    export PATH="/usr/local/bin:$HOME/.local/share/fnm:$PATH"
    if command -v node &> /dev/null && command -v npm &> /dev/null; then
        log_info "Node.js $(node -v) 安装成功"
        log_info "npm $(npm -v) 安装成功"
        return 0
    else
        log_error "Node.js 安装验证失败"
        return 1
    fi
}

# 检查并安装 Node.js
if ! check_nodejs; then
    log_warn "Node.js 环境不满足要求 (需要 v18+)"
    if ! install_nodejs; then
        log_error "Node.js 自动安装失败"
        log_warn "请手动安装 Node.js v18+ 后重新运行"
        log_warn "推荐安装方式: curl -fsSL https://fnm.vercel.app/install | bash && fnm install 18"
        exit 1
    fi
else
    log_info "Node.js $(node -v) 环境正常"
fi

# 配置 npm 国内镜像
log_step "配置 npm 镜像..."
npm config set registry https://registry.npmmirror.com
log_info "npm 镜像配置完成"

# ==================== 环境变量配置 ====================
log_step "检查环境变量配置..."

if [ ! -f .env ]; then
    log_warn ".env 文件不存在，创建默认配置"
    cat > .env << 'EOF'
DB_NAME=claude_switcher
DB_USER=dev
DB_PASSWORD=dev123
DB_ROOT_PASSWORD=root123
EOF
    log_info "默认配置已创建，建议修改密码"
else
    log_info ".env 配置文件已存在"
fi

if [ ! -f backend/.env ]; then
    log_warn "backend/.env 文件不存在，创建默认配置"
    cat > backend/.env << 'EOF'
PORT=3001
HTTPS_PORT=3443

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=claude_switcher
DB_USER=dev
DB_PASSWORD=dev123

NODE_ENV=production

ADMIN_USERNAME=admin
ADMIN_PASSWORD=

ADMIN_ALLOWED_IPS=127.0.0.1,::1
EOF
    log_info "默认配置已创建"
fi

# ==================== 构建项目 ====================
log_step "构建后端项目..."
cd backend

if [ ! -d "node_modules" ]; then
    log_step "安装依赖包..."
    npm install --production=false
fi

log_step "编译 TypeScript..."
npm run build

if [ ! -d "dist" ] || [ ! -f "dist/server.js" ]; then
    log_error "构建失败，请检查错误信息"
    exit 1
fi

log_info "项目构建完成"
cd ..

# ==================== Docker 镜像准备 ====================
log_step "准备 Docker 镜像..."

# 拉取 MySQL 镜像
if ! docker images | grep -q "mysql.*8.0"; then
    log_step "拉取 MySQL 镜像..."
    docker pull mysql:8.0 || {
        log_warn "官方镜像拉取失败，尝试阿里云镜像"
        docker pull registry.cn-hangzhou.aliyuncs.com/library/mysql:8.0
        docker tag registry.cn-hangzhou.aliyuncs.com/library/mysql:8.0 mysql:8.0
    }
fi

# 拉取 Node 镜像
if ! docker images | grep -q "node.*18-alpine"; then
    log_step "拉取 Node 镜像..."
    docker pull node:18-alpine || {
        log_warn "官方镜像拉取失败，尝试阿里云镜像"
        docker pull registry.cn-hangzhou.aliyuncs.com/library/node:18-alpine
        docker tag registry.cn-hangzhou.aliyuncs.com/library/node:18-alpine node:18-alpine
    }
fi

log_info "Docker 镜像准备完成"

# ==================== 启动服务 ====================
log_step "启动服务..."

# 停止旧容器
docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true

# 启动新容器
if docker compose version &> /dev/null; then
    docker compose up -d --build
else
    docker-compose up -d --build
fi

log_info "服务启动中..."

# ==================== 等待数据库就绪 ====================
log_step "等待数据库启动..."
MAX_WAIT=60
WAIT_COUNT=0

while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if docker compose exec -T db mysqladmin ping -h localhost -uroot -p${DB_ROOT_PASSWORD:-root123} --silent 2>/dev/null; then
        log_info "数据库已就绪"
        break
    fi
    sleep 2
    WAIT_COUNT=$((WAIT_COUNT + 2))
    echo -n "."
done
echo ""

if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
    log_error "数据库启动超时"
    docker compose logs db
    exit 1
fi

# ==================== 数据库迁移 ====================
log_step "运行数据库迁移..."
sleep 5

if docker compose exec -T backend npm run migrate 2>/dev/null; then
    log_info "数据库迁移完成"
else
    log_warn "自动迁移失败，尝试手动迁移"
    # 手动执行 SQL 文件
    for sql_file in backend/src/database/migrations/*.sql; do
        if [ -f "$sql_file" ]; then
            docker compose exec -T db mysql -uroot -p${DB_ROOT_PASSWORD:-root123} ${DB_NAME:-claude_switcher} < "$sql_file" 2>/dev/null || true
        fi
    done
    log_info "手动迁移完成"
fi

# ==================== 检查服务状态 ====================
log_step "检查服务状态..."
sleep 3

if docker compose ps | grep -q "Up"; then
    log_info "服务运行正常"
else
    log_error "服务启动失败"
    docker compose ps
    docker compose logs --tail=30
    exit 1
fi

# ==================== 防火墙配置 ====================
log_step "配置防火墙..."
if command -v ufw &> /dev/null; then
    ufw allow 3000/tcp comment 'Auto-Cookie Backend' 2>/dev/null || true
    log_info "防火墙规则已添加"
fi

# ==================== 完成 ====================
echo ""
echo "========================================"
log_info "部署完成！"
echo "========================================"
echo ""

# 获取服务器 IP
SERVER_IP=$(hostname -I | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "localhost")
fi

echo "服务信息："
echo "  前端地址: http://${SERVER_IP}:3000"
echo "  管理后台: http://${SERVER_IP}:3000/admin.html"
echo ""
echo "常用命令："
echo "  查看日志: docker compose logs -f"
echo "  重启服务: docker compose restart"
echo "  停止服务: docker compose down"
echo "  查看状态: docker compose ps"
echo ""
echo "数据库信息："
echo "  地址: ${SERVER_IP}:3306"
echo "  数据库: ${DB_NAME:-claude_switcher}"
echo "  用户: ${DB_USER:-dev}"
echo ""
log_warn "首次访问管理后台时需要设置管理员密码"
log_warn "生产环境请修改 .env 和 backend/.env 中的默认密码"
echo ""
