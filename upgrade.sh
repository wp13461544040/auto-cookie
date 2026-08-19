#!/bin/bash
# Auto-Cookie 升级脚本
# 自动拉取最新代码并重新部署

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

echo "========================================"
echo "  Auto-Cookie 升级脚本"
echo "========================================"
echo ""

# 检查是否在项目目录
if [ ! -f "docker-compose.yml" ]; then
    log_error "请在项目根目录运行此脚本"
    exit 1
fi

# 检查 Git 状态
if [ ! -d ".git" ]; then
    log_error "此目录不是 Git 仓库，无法自动升级"
    log_warn "请手动下载最新代码或重新克隆项目"
    exit 1
fi

# 备份配置文件
log_step "备份配置文件..."
BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

if [ -f .env ]; then
    cp .env "$BACKUP_DIR/.env"
fi

if [ -f backend/.env ]; then
    cp backend/.env "$BACKUP_DIR/backend.env"
fi

if [ -d backend/dist ]; then
    cp -r backend/dist "$BACKUP_DIR/dist_backup" 2>/dev/null || true
fi

log_info "配置文件已备份到: $BACKUP_DIR"

# 停止服务
log_step "停止当前服务..."
docker compose down 2>/dev/null || docker-compose down 2>/dev/null || {
    log_warn "服务停止失败，继续执行"
}

# 保存当前版本信息
CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
log_info "当前版本: $CURRENT_COMMIT"

# 拉取最新代码
log_step "拉取最新代码..."

# 暂存本地修改
if ! git diff --quiet || ! git diff --cached --quiet; then
    log_warn "检测到本地修改，暂存中..."
    git stash push -m "auto-stash-before-upgrade-$(date +%Y%m%d_%H%M%S)"
fi

# 拉取更新
if git pull origin main 2>/dev/null || git pull origin master 2>/dev/null; then
    NEW_COMMIT=$(git rev-parse --short HEAD)
    if [ "$CURRENT_COMMIT" = "$NEW_COMMIT" ]; then
        log_info "已是最新版本，无需升级"
        SKIP_BUILD=true
    else
        log_info "代码已更新: $CURRENT_COMMIT → $NEW_COMMIT"
        SKIP_BUILD=false
    fi
else
    log_error "代码拉取失败"
    log_warn "正在回滚..."
    git reset --hard HEAD
    exit 1
fi

# 恢复配置文件
log_step "恢复配置文件..."
if [ -f "$BACKUP_DIR/.env" ]; then
    cp "$BACKUP_DIR/.env" .env
    log_info ".env 已恢复"
fi

if [ -f "$BACKUP_DIR/backend.env" ]; then
    cp "$BACKUP_DIR/backend.env" backend/.env
    log_info "backend/.env 已恢复"
fi

# 配置 npm 镜像
npm config set registry https://registry.npmmirror.com 2>/dev/null || true

# 重新构建
if [ "$SKIP_BUILD" != "true" ]; then
    log_step "重新构建项目..."
    
    cd backend
    
    # 检查依赖是否需要更新
    if [ -f package-lock.json ]; then
        log_step "更新依赖包..."
        npm ci || npm install
    else
        npm install
    fi
    
    # 编译
    log_step "编译 TypeScript..."
    npm run build
    
    if [ ! -f "dist/server.js" ]; then
        log_error "构建失败"
        cd ..
        
        # 回滚
        log_warn "正在回滚到之前版本..."
        git reset --hard "$CURRENT_COMMIT"
        
        if [ -f "$BACKUP_DIR/dist_backup" ]; then
            cp -r "$BACKUP_DIR/dist_backup" backend/dist
        fi
        
        exit 1
    fi
    
    cd ..
    log_info "项目构建完成"
else
    log_info "跳过构建步骤"
fi

# 检查数据库迁移文件
log_step "检查数据库迁移..."
if [ -d "backend/src/database/migrations" ]; then
    MIGRATION_COUNT=$(ls backend/src/database/migrations/*.sql 2>/dev/null | wc -l)
    if [ "$MIGRATION_COUNT" -gt 0 ]; then
        log_info "发现 $MIGRATION_COUNT 个迁移文件"
        HAS_MIGRATIONS=true
    else
        HAS_MIGRATIONS=false
    fi
else
    HAS_MIGRATIONS=false
fi

# 重新启动服务
log_step "启动服务..."
if docker compose version &> /dev/null; then
    docker compose up -d --build
else
    docker-compose up -d --build
fi

log_info "服务启动中..."

# 等待数据库
log_step "等待数据库就绪..."
sleep 10

MAX_WAIT=30
WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if docker compose ps | grep -q "db.*Up"; then
        break
    fi
    sleep 2
    WAIT_COUNT=$((WAIT_COUNT + 2))
done

# 运行数据库迁移
if [ "$HAS_MIGRATIONS" = "true" ]; then
    log_step "运行数据库迁移..."
    sleep 3
    
    if docker compose exec -T backend npm run migrate 2>/dev/null; then
        log_info "数据库迁移完成"
    else
        log_warn "自动迁移失败，请手动检查"
    fi
fi

# 检查服务状态
log_step "检查服务状态..."
sleep 5

if docker compose ps | grep -q "backend.*Up"; then
    log_info "后端服务运行正常"
else
    log_error "后端服务启动失败"
    echo ""
    log_step "查看最近日志："
    docker compose logs --tail=50 backend
    echo ""
    log_warn "升级可能失败，请检查日志"
    exit 1
fi

# 清理旧镜像
log_step "清理旧镜像..."
docker image prune -f > /dev/null 2>&1 || true
log_info "清理完成"

# 完成
echo ""
echo "========================================"
log_info "升级完成！"
echo "========================================"
echo ""

SERVER_IP=$(hostname -I | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "localhost")
fi

echo "版本信息："
echo "  原版本: $CURRENT_COMMIT"
echo "  新版本: $(git rev-parse --short HEAD)"
echo ""
echo "服务地址："
echo "  前端: http://${SERVER_IP}:3000"
echo "  管理后台: http://${SERVER_IP}:3000/admin.html"
echo ""
echo "备份位置："
echo "  $BACKUP_DIR"
echo ""
echo "常用命令："
echo "  查看日志: docker compose logs -f"
echo "  查看状态: docker compose ps"
echo ""

# 显示变更日志（如果有）
if [ "$CURRENT_COMMIT" != "$(git rev-parse --short HEAD)" ]; then
    log_step "最近更新："
    git log --oneline --graph --decorate -10
fi

echo ""
log_warn "升级后建议测试核心功能是否正常"
echo ""
