#!/bin/bash
# Docker Compose 独立安装脚本（多种方式）

set -e

echo "=== Docker Compose 安装工具 ==="

# 方法1：使用 DaoCloud 镜像（推荐）
install_daocloud() {
    echo "方法1: 使用 DaoCloud 镜像..."
    curl -L --connect-timeout 10 --max-time 120 \
        https://get.daocloud.io/docker/compose/releases/download/v2.24.5/docker-compose-$(uname -s)-$(uname -m) \
        -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
}

# 方法2：使用 GitHub 镜像
install_github_mirror() {
    echo "方法2: 使用 GitHub 镜像..."
    curl -L --connect-timeout 10 --max-time 120 \
        https://mirror.ghproxy.com/https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-$(uname -s)-$(uname -m) \
        -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
}

# 方法3：使用 pip
install_pip() {
    echo "方法3: 使用 pip 安装..."
    apt update
    apt install -y python3-pip
    pip3 install -U pip
    pip3 install docker-compose
}

# 方法4：使用 apt（Ubuntu/Debian）
install_apt() {
    echo "方法4: 使用 apt 安装..."
    apt update
    apt install -y docker-compose
}

# 尝试安装
if command -v docker-compose &> /dev/null; then
    echo "Docker Compose 已安装: $(docker-compose --version)"
    exit 0
fi

# 依次尝试各种方法
install_daocloud && echo "✓ 安装成功" && exit 0
install_github_mirror && echo "✓ 安装成功" && exit 0
install_pip && echo "✓ 安装成功" && exit 0
install_apt && echo "✓ 安装成功" && exit 0

echo "✗ 所有方法均失败"
exit 1
