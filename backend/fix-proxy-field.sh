#!/bin/bash
# 修复 proxy 字段缺失问题

set -e

echo "================================================"
echo "修复 proxy 字段缺失问题"
echo "================================================"

# 检查是否在正确的目录
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ 错误：请在项目根目录（/root/auto-cookie）执行此脚本"
    exit 1
fi

# 读取数据库密码
if [ ! -f ".env" ]; then
    echo "❌ 错误：找不到 .env 文件"
    exit 1
fi

DB_PASSWORD=$(grep DB_ROOT_PASSWORD .env | cut -d '=' -f 2 | tr -d ' "'"'"'')

if [ -z "$DB_PASSWORD" ]; then
    echo "❌ 错误：无法从 .env 读取 DB_ROOT_PASSWORD"
    exit 1
fi

echo "✓ 已读取数据库密码"

# 检查 proxy 字段是否已存在
echo ""
echo "[1/3] 检查 proxy 字段..."

CHECK_RESULT=$(docker-compose exec -T db mysql -uroot -p"$DB_PASSWORD" claude_switcher -e "SHOW COLUMNS FROM session_keys LIKE 'proxy';" 2>/dev/null || echo "")

if echo "$CHECK_RESULT" | grep -q "proxy"; then
    echo "✓ proxy 字段已存在，无需修复"
    echo ""
    echo "字段信息："
    echo "$CHECK_RESULT"
    exit 0
fi

echo "⚠ proxy 字段不存在，开始修复..."

# 添加 proxy 字段
echo ""
echo "[2/3] 添加 proxy 字段..."

docker-compose exec -T db mysql -uroot -p"$DB_PASSWORD" claude_switcher <<'EOF'
ALTER TABLE session_keys ADD COLUMN proxy VARCHAR(255) NULL COMMENT '代理地址' AFTER cfUvid;
EOF

if [ $? -eq 0 ]; then
    echo "✓ proxy 字段添加成功"
else
    echo "❌ 添加失败"
    exit 1
fi

# 验证字段
echo ""
echo "[3/3] 验证字段..."

VERIFY_RESULT=$(docker-compose exec -T db mysql -uroot -p"$DB_PASSWORD" claude_switcher -e "SHOW COLUMNS FROM session_keys LIKE 'proxy';")

if echo "$VERIFY_RESULT" | grep -q "proxy"; then
    echo "✓ 验证成功"
    echo ""
    echo "字段信息："
    echo "$VERIFY_RESULT"
else
    echo "❌ 验证失败"
    exit 1
fi

# 重启后端服务
echo ""
echo "[完成] 重启后端服务..."
docker-compose restart backend

echo ""
echo "================================================"
echo "✅ 修复完成！"
echo "================================================"
echo ""
echo "你现在可以："
echo "1. 访问后台管理页面测试"
echo "2. 使用插件切换账号"
echo ""
