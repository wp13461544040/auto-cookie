#!/bin/bash
# 快速同步修复文件到服务器

if [ -z "$1" ]; then
    echo "用法: bash sync-fix.sh root@服务器IP"
    exit 1
fi

SERVER=$1

echo "=== 同步修复文件到服务器 ==="

# 上传修复后的文件
scp backend/package.json $SERVER:/root/auto-cookie/backend/
scp backend/tsconfig.json $SERVER:/root/auto-cookie/backend/
scp backend/src/routes/admin.ts $SERVER:/root/auto-cookie/backend/src/routes/
scp backend/src/generator/cli.ts $SERVER:/root/auto-cookie/backend/src/generator/

echo "✓ 文件上传完成"
echo ""
echo "在服务器上执行以下命令："
echo "  cd /root/auto-cookie/backend"
echo "  rm -rf node_modules package-lock.json"
echo "  npm install"
echo "  npm run build"
echo "  cd .."
echo "  docker compose restart backend"
