# 📦 如何发布新版本到 GitHub

## 准备工作

### 1. 确保代码已提交

```bash
git status
# 确保没有未提交的修改
```

### 2. 更新版本号

编辑以下文件，更新版本号：

- `extension/package.json` - "version": "1.0.0"
- `backend/package.json` - "version": "1.0.0"
- `manifest.json` - "version": "1.0.0"

### 3. 提交版本更新

```bash
git add -A
git commit -m "chore: bump version to 1.0.0"
git push origin main
```

---

## 打包插件

### Windows 用户

双击运行 `scripts/pack-extension.bat`

或在项目根目录执行：
```cmd
cd extension
npm run build
cd dist
powershell -Command "Compress-Archive -Path * -DestinationPath ..\..\extension.zip -Force"
cd ..\..
```

### Linux/Mac 用户

```bash
bash scripts/pack-extension.sh
```

或手动执行：
```bash
cd extension
npm install
npm run build
cd dist
zip -r ../../extension.zip ./*
cd ../..
```

完成后会在项目根目录生成 `extension.zip` 文件。

---

## 发布到 GitHub

### 1. 创建 Git Tag

```bash
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

### 2. 创建 GitHub Release

1. 访问仓库页面：https://github.com/wp13461544040/auto-cookie
2. 点击右侧的 **Releases**
3. 点击 **Draft a new release**
4. 填写信息：
   - **Choose a tag**: 选择刚才创建的 `v1.0.0`
   - **Release title**: `v1.0.0 - Claude 账号切换插件首发`
   - **Describe this release**: 复制 `.github/RELEASE_TEMPLATE.md` 的内容

### 3. 上传文件

在 **Attach binaries** 区域，拖拽或点击上传：
- `extension.zip` - 插件安装包

### 4. 发布

- 勾选 **Set as the latest release**（如果是最新版本）
- 点击 **Publish release**

---

## 📝 Release 描述模板

复制以下内容到 Release 描述：

```markdown
# Release v1.0.0

## 🎉 新功能

- ✨ 一键切换 Claude 账号
- ✨ 支持激活码管理和使用次数限制
- ✨ 完美支持无痕模式
- ✨ 自动验证 SessionKey 有效性
- ✨ 失效检测，验证失败不扣费

## 🐛 修复

- 🐛 修复无痕模式下验证失败的问题
- 🐛 修复 Service Worker 无法携带 cookies 的问题

## 📦 下载

下载 `extension.zip`，解压后按照[使用指南](./USAGE_CN.md)安装。

**支持的浏览器：**
- ✅ Chrome 88+
- ✅ Edge 88+

## 📖 文档

- [使用指南](./USAGE_CN.md)
- [完整文档](./README.md)

## ⚡ 快速开始

1. 下载 `extension.zip`
2. 解压到任意文件夹
3. 打开 Chrome，访问 `chrome://extensions/`
4. 启用"开发者模式"
5. 点击"加载已解压的扩展程序"
6. 选择解压的文件夹
7. 配置后端 API 地址
8. 输入激活码，开始使用！

## 🙏 致谢

感谢所有贡献者和使用者的支持！
```

---

## 验证发布

### 1. 检查 Release 页面

访问：https://github.com/wp13461544040/auto-cookie/releases

确认：
- ✅ Release 标题和版本号正确
- ✅ `extension.zip` 文件可以下载
- ✅ 描述信息完整

### 2. 测试下载的插件

1. 从 Release 页面下载 `extension.zip`
2. 解压并安装到浏览器
3. 测试基本功能：
   - 配置后端地址
   - 切换账号
   - 验证成功/失败提示

---

## 通知用户

### 更新 README

在 README.md 顶部添加最新版本信息：

```markdown
![Latest Release](https://img.shields.io/github/v/release/wp13461544040/auto-cookie)
![Downloads](https://img.shields.io/github/downloads/wp13461544040/auto-cookie/total)
```

### 社交媒体

（可选）在相关平台发布更新通知。

---

## 版本号规范

遵循 [Semantic Versioning](https://semver.org/)：

- **主版本号 (Major)**：不兼容的 API 变更
- **次版本号 (Minor)**：向后兼容的功能新增
- **修订号 (Patch)**：向后兼容的问题修正

示例：
- `1.0.0` - 首次发布
- `1.0.1` - Bug 修复
- `1.1.0` - 新功能
- `2.0.0` - 重大更新

---

## 回滚版本

如果发现问题需要回滚：

### 1. 删除 Tag

```bash
git tag -d v1.0.0
git push origin :refs/tags/v1.0.0
```

### 2. 删除 Release

在 GitHub Release 页面点击 **Delete** 删除发布。

### 3. 修复问题后重新发布

按照上述流程重新发布正确的版本。

---

## 常见问题

### Q: 如何编辑已发布的 Release？

A: 在 Release 页面点击对应版本右侧的 ✏️ **Edit** 按钮。

### Q: 可以替换已上传的文件吗？

A: 可以删除旧文件后重新上传，但不建议这样做。建议发布新版本。

### Q: 如何设置预发布版本？

A: 创建 Release 时勾选 **This is a pre-release**，版本号使用 `v1.0.0-beta.1` 格式。

---

## 自动化发布（高级）

可以使用 GitHub Actions 自动化发布流程。

创建 `.github/workflows/release.yml`：

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Build Extension
        run: |
          cd extension
          npm install
          npm run build
          cd dist
          zip -r ../../extension.zip ./*
      
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: extension.zip
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

这样每次推送 tag 就会自动构建并发布。

---

## 📞 需要帮助？

遇到问题请查看：
- [GitHub 发布文档](https://docs.github.com/en/repositories/releasing-projects-on-github)
- [项目 Issues](https://github.com/wp13461544040/auto-cookie/issues)
