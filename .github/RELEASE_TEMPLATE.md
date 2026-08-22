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
- 🐛 修复数据库迁移失败的问题

## 📦 下载

### 插件安装包

下载 `extension.zip`，解压后按照[使用指南](../USAGE_CN.md)安装。

**支持的浏览器：**
- ✅ Chrome 88+
- ✅ Edge 88+
- ❌ Firefox（暂不支持）

### 源码

如需从源码编译，请参考 [README.md](../README.md#方式二从源码编译)

## 📖 文档

- [使用指南 (中文)](../USAGE_CN.md)
- [完整文档](../README.md)
- [常见问题](../README.md#-常见问题)

## 🔧 后端部署

后端 API 使用 Docker 一键部署：

```bash
git clone https://github.com/wp13461544040/auto-cookie.git
cd auto-cookie
cp .env.example .env
# 编辑 .env 配置数据库密码
docker-compose up -d
```

详见：[后端部署说明](../README.md#-后端部署)

## ⚡ 快速开始

1. 下载 `extension.zip`
2. 解压到任意文件夹
3. 打开 Chrome，访问 `chrome://extensions/`
4. 启用"开发者模式"
5. 点击"加载已解压的扩展程序"
6. 选择解压的文件夹
7. 配置后端 API 地址
8. 输入激活码，开始使用！

## 📊 版本信息

- **版本号**: v1.0.0
- **发布日期**: 2026-08-21
- **兼容性**: Chrome 88+, Edge 88+

## 🙏 致谢

感谢所有贡献者和使用者的支持！

## 📞 反馈

遇到问题？请[提交 Issue](https://github.com/wp13461544040/auto-cookie/issues)

---

**Full Changelog**: https://github.com/wp13461544040/auto-cookie/commits/v1.0.0
