#!/bin/bash
# 更新脚本

set -e

echo "=== 更新 Auto-Cookie ==="

# 1. 拉取最新代码
git pull

# 2. 重新构建
cd backend
npm install
npm run build
cd ..

# 3. 重启服务
docker-compose down
docker-compose up -d --build

# 4. 运行迁移（如有新的）
sleep 10
docker-compose exec -T backend npm run migrate || echo "无新迁移"

echo "=== 更新完成 ==="
docker-compose logs --tail=20
