#!/bin/bash
# 修复 docker-compose 版本问题

set -e

echo "=== 修复 docker-compose 版本冲突 ==="

# 1. 卸载 pip 安装的旧版本
echo "卸载旧版本..."
pip3 uninstall -y docker-compose 2>/dev/null || true
pip uninstall -y docker-compose 2>/dev/null || true

# 2. 删除旧的可执行文件
rm -f /usr/local/bin/docker-compose
rm -f /usr/bin/docker-compose

# 3. 下载安装新版本
echo "安装 Docker Compose v2.24.5..."

# 尝试多个下载源
if curl -L --connect-timeout 10 --max-time 120 \
    https://get.daocloud.io/docker/compose/releases/download/v2.24.5/docker-compose-$(uname -s)-$(uname -m) \
    -o /usr/local/bin/docker-compose; then
    echo "✓ DaoCloud 下载成功"
elif curl -L --connect-timeout 10 --max-time 120 \
    https://mirror.ghproxy.com/https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-$(uname -s)-$(uname -m) \
    -o /usr/local/bin/docker-compose; then
    echo "✓ GitHub 镜像下载成功"
else
    echo "✗ 下载失败，尝试使用 Docker Compose V2 插件"
    # 使用 Docker 插件版本
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -L https://get.daocloud.io/docker/compose/releases/download/v2.24.5/docker-compose-$(uname -s)-$(uname -m) \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose
fi

# 4. 设置权限
chmod +x /usr/local/bin/docker-compose

# 5. 验证安装
echo ""
if docker-compose version; then
    echo "✓ Docker Compose 安装成功"
else
    echo "✗ 安装失败"
    exit 1
fi

echo ""
echo "=== 修复完成，可以继续部署 ==="
