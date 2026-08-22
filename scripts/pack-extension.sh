#!/bin/bash
# 打包浏览器插件为 zip 文件，用于发布 Release

set -e

echo "================================================"
echo "打包 Claude Account Switcher 插件"
echo "================================================"
echo ""

# 检查是否在项目根目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    exit 1
fi

# 进入插件目录
cd extension

echo "[1/4] 清理旧文件..."
rm -rf dist
rm -f ../extension.zip

echo "[2/4] 安装依赖..."
npm install

echo "[3/4] 编译插件..."
npm run build

echo "[4/4] 打包 zip..."
cd dist
zip -r ../../extension.zip ./*
cd ../..

echo ""
echo "================================================"
echo "✅ 打包完成！"
echo "================================================"
echo ""
echo "文件位置: $(pwd)/extension.zip"
echo "文件大小: $(du -h extension.zip | cut -f1)"
echo ""
echo "下一步："
echo "1. 在 GitHub 创建新 Release"
echo "2. 上传 extension.zip 文件"
echo "3. 填写版本说明"
echo ""
