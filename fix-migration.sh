#!/bin/bash
# 修复数据库迁移问题

set -e

echo "=== 修复数据库迁移 ==="
echo ""

# 进入项目目录
cd /root/auto-cookie || cd ~/auto-cookie || {
    echo "错误：找不到项目目录"
    exit 1
}

echo "[1/4] 检查数据库连接..."
docker-compose exec -T db mysql -uroot -p"$DB_ROOT_PASSWORD" -e "SELECT 1" > /dev/null 2>&1 || {
    echo "错误：无法连接到数据库"
    exit 1
}
echo "✓ 数据库连接正常"

echo ""
echo "[2/4] 检查 proxy 字段是否存在..."
PROXY_EXISTS=$(docker-compose exec -T db mysql -uroot -p"$DB_ROOT_PASSWORD" claude_switcher -N -e "
SELECT COUNT(*) 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'claude_switcher' 
  AND TABLE_NAME = 'session_keys' 
  AND COLUMN_NAME = 'proxy';
" 2>/dev/null | tr -d '\r\n')

if [ "$PROXY_EXISTS" = "1" ]; then
    echo "✓ proxy 字段已存在"
else
    echo "✗ proxy 字段不存在，正在添加..."
    
    echo ""
    echo "[3/4] 添加 proxy 字段..."
    docker-compose exec -T db mysql -uroot -p"$DB_ROOT_PASSWORD" claude_switcher -e "
ALTER TABLE \`session_keys\`
  ADD COLUMN \`proxy\` VARCHAR(255) NULL COMMENT '代理地址' AFTER \`cfUvid\`;
" 2>/dev/null && echo "✓ proxy 字段添加成功" || {
        echo "✗ 添加失败，可能字段已存在或有其他错误"
    }
fi

echo ""
echo "[4/4] 验证表结构..."
docker-compose exec -T db mysql -uroot -p"$DB_ROOT_PASSWORD" claude_switcher -e "
SELECT 
  COLUMN_NAME, 
  DATA_TYPE, 
  IS_NULLABLE, 
  COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'claude_switcher' 
  AND TABLE_NAME = 'session_keys'
ORDER BY ORDINAL_POSITION;
"

echo ""
echo "=== 修复完成 ==="
echo ""
echo "重启后端服务..."
docker-compose restart backend

echo ""
echo "✓ 完成！查看服务状态："
docker-compose ps
