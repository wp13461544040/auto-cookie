# Claude 账号一键切换插件

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Chrome](https://img.shields.io/badge/Chrome-支持-brightgreen.svg)
![Edge](https://img.shields.io/badge/Edge-支持-brightgreen.svg)

一键切换 Claude 账号的浏览器插件，支持激活码管理、使用次数限制、自动解绑等功能。

[功能特性](#-功能特性) • [安装教程](#-安装教程) • [使用指南](#-使用指南) • [部署说明](#-后端部署)

</div>

---

## 📖 目录

- [功能特性](#-功能特性)
- [安装教程](#-安装教程)
  - [方式一：从 GitHub 下载安装](#方式一从-github-下载安装推荐)
  - [方式二：从源码编译](#方式二从源码编译)
- [使用指南](#-使用指南)
  - [配置后端地址](#1-配置后端地址)
  - [切换账号](#2-切换账号)
  - [查看剩余次数](#3-查看剩余次数)
- [后端部署](#-后端部署)
- [后台管理](#-后台管理)
- [常见问题](#-常见问题)
- [技术栈](#-技术栈)
- [贡献指南](#-贡献指南)
- [许可证](#-许可证)

---

## ✨ 功能特性

### 🎯 核心功能

- **一键切换账号**：输入激活码，自动切换 Claude 账号
- **使用次数管理**：支持激活码使用次数限制
- **无痕模式支持**：完美支持浏览器无痕模式
- **自动验证**：切换后自动验证 SessionKey 有效性
- **失效检测**：检测到失效账号自动清理，不扣除使用次数

### 🛠️ 管理功能

- **激活码管理**：生成、批量生成、删除激活码
- **账号管理**：添加、编辑、删除 Claude 账号
- **使用日志**：记录每次切换的时间、IP、激活码
- **自动解绑**：配置自动解绑时间，过期自动删除

### 🔐 安全特性

- **失效保护**：验证失败不扣除使用次数
- **重试机制**：无痕模式下支持 3 次验证重试
- **日志记录**：完整的使用日志便于审计

---

## 📥 安装教程

### 方式一：从 GitHub 下载安装（推荐）

#### 1. 下载插件

**方法 A：下载 Release 版本（推荐）**

前往 [Releases 页面](https://github.com/wp13461544040/auto-cookie/releases)，下载最新版本的 `extension.zip`

**方法 B：下载源码后编译**

```bash
# 克隆仓库
git clone https://github.com/wp13461544040/auto-cookie.git

# 进入插件目录
cd auto-cookie/extension

# 安装依赖
npm install

# 编译插件
npm run build
```

编译完成后，插件文件在 `extension/dist` 目录中。

#### 2. 解压文件

如果下载的是 `extension.zip`，解压到任意目录（建议放在不会删除的位置）。

#### 3. 安装到 Chrome/Edge

##### Chrome 浏览器

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 打开右上角的 **"开发者模式"**
4. 点击 **"加载已解压的扩展程序"**
5. 选择解压后的 `dist` 文件夹（或包含 `manifest.json` 的文件夹）
6. 插件安装完成！

![Chrome 安装示意图](https://via.placeholder.com/800x400?text=Chrome+Extension+Installation)

##### Edge 浏览器

1. 打开 Edge 浏览器
2. 访问 `edge://extensions/`
3. 打开左下角的 **"开发人员模式"**
4. 点击 **"加载解压缩的扩展"**
5. 选择解压后的 `dist` 文件夹
6. 插件安装完成！

#### 4. 固定插件图标（可选）

点击浏览器地址栏右侧的 **拼图图标** 🧩，找到 "Claude Account Switcher"，点击 📌 固定到工具栏。

---

### 方式二：从源码编译

适合开发者或需要自定义功能的用户。

#### 1. 克隆仓库

```bash
git clone https://github.com/wp13461544040/auto-cookie.git
cd auto-cookie
```

#### 2. 编译插件

```bash
# 进入插件目录
cd extension

# 安装依赖
npm install

# 开发模式编译（带 source map）
npm run build:dev

# 生产模式编译（压缩代码）
npm run build
```

#### 3. 加载插件

编译完成后，按照 [方式一 第3步](#3-安装到-chromeedge) 加载 `extension/dist` 目录。

---

## 📖 使用指南

### 1. 配置后端地址

首次使用需要配置后端 API 地址。

#### 方法 A：通过插件弹窗设置

1. 点击浏览器工具栏中的插件图标
2. 点击弹窗右上角的 **⚙️ 设置** 按钮
3. 在 "后端 API 地址" 输入框中填入：
   ```
   http://你的服务器IP或域名
   ```
   例如：`http://122.51.109.200` 或 `https://api.example.com`
4. 点击 **保存设置**

![设置后端地址](https://via.placeholder.com/600x400?text=Backend+API+Settings)

#### 方法 B：通过选项页设置

1. 右键点击插件图标
2. 选择 **"选项"** 或 **"扩展程序选项"**
3. 填写后端 API 地址
4. 点击保存

---

### 2. 切换账号

#### 步骤

1. 点击浏览器工具栏中的插件图标
2. 在 **激活码** 输入框中输入你的激活码
   - 激活码格式：20 位字符（如：`ABCD-EFGH-1234-5678`）
3. 点击 **切换账号** 按钮
4. 等待切换完成（通常 3-5 秒）

![切换账号界面](https://via.placeholder.com/400x500?text=Switch+Account+Interface)

#### 状态说明

- **⏳ 切换中**：正在切换账号，请稍候
- **✅ 切换成功**：账号已切换，剩余 X 次使用
- **❌ 切换失败**：
  - 激活码无效或已过期
  - SessionKey 验证失败（账号失效，不扣次数）
  - 网络连接失败

#### 验证失败说明

如果看到：
```
❌ SessionKey 验证失败，此账号已失效（不扣除使用次数），请重试获取新账号
```

**说明**：
- 该账号的 SessionKey 已失效
- **本次切换不扣除使用次数**
- 后台已自动清理该失效账号
- 请重新切换获取新账号

---

### 3. 查看剩余次数

切换成功后，插件会显示：

```
✅ 切换成功！剩余 5 次使用
```

- **剩余次数**：该激活码还可以使用的次数
- 每次成功切换会扣除 1 次
- **验证失败不扣次数**

---

### 4. 无痕模式使用

插件完美支持浏览器的无痕模式（隐身模式）。

#### 步骤

1. 打开无痕窗口
   - Chrome：`Ctrl + Shift + N`
   - Edge：`Ctrl + Shift + N`
2. 在无痕窗口中使用插件切换账号
3. 切换后的账号仅在该无痕窗口生效
4. 关闭无痕窗口后，账号信息自动清除

**注意**：
- 无痕模式下验证可能需要稍长时间（支持自动重试）
- 普通窗口和无痕窗口的账号是隔离的

---

## 🚀 后端部署

插件需要配合后端 API 使用。后端负责管理激活码、账号、使用次数等。

### 快速部署（Docker）

#### 1. 克隆仓库

```bash
git clone https://github.com/wp13461544040/auto-cookie.git
cd auto-cookie
```

#### 2. 配置环境变量

复制并编辑 `.env` 文件：

```bash
cp .env.example .env
nano .env
```

修改以下配置：

```env
# 数据库配置
DB_HOST=db
DB_PORT=3306
DB_USER=claude_user
DB_PASSWORD=your_secure_password_here  # 修改为强密码
DB_NAME=claude_switcher
DB_ROOT_PASSWORD=your_root_password_here  # 修改为强密码

# 后端配置
BACKEND_PORT=3000
NODE_ENV=production

# 管理员配置
ADMIN_PASSWORD=your_admin_password_here  # 修改为管理后台密码
```

#### 3. 启动服务

```bash
docker-compose up -d
```

#### 4. 验证部署

访问：`http://你的服务器IP:3000/health`

看到 `{"status":"ok"}` 说明部署成功。

#### 5. 访问后台管理

访问：`http://你的服务器IP/admin.html`

默认密码：在 `.env` 中配置的 `ADMIN_PASSWORD`

---

### 手动部署（Node.js）

#### 1. 安装依赖

```bash
cd backend
npm install
```

#### 2. 配置数据库

创建 MySQL 数据库：

```sql
CREATE DATABASE claude_switcher CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

配置 `backend/.env` 文件（参考上面的环境变量）。

#### 3. 运行数据库迁移

```bash
npm run migrate
```

#### 4. 启动后端

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

后端默认运行在 `http://localhost:3000`

---

## 🎛️ 后台管理

### 访问后台

访问：`http://你的服务器地址/admin.html`

输入管理员密码登录。

### 功能说明

#### 1️⃣ 激活码管理

- **生成激活码**
  - 单个生成：指定使用次数
  - 批量生成：一次生成多个激活码
  - 自动生成 20 位唯一激活码
  
- **查看激活码列表**
  - 激活码、使用次数、剩余次数
  - 创建时间、最后使用时间
  
- **删除激活码**
  - 删除指定激活码
  - 同时删除相关的使用日志

#### 2️⃣ 账号管理

- **添加账号**
  - 输入 SessionKey
  - 选择绑定的激活码
  - 可选：标签、邮箱、代理地址
  
- **查看账号列表**
  - SessionKey（脱敏显示）
  - 标签、邮箱、使用次数
  - 状态（正常/失效）、最后验证时间
  
- **编辑账号**
  - 修改标签、邮箱
  - 更换绑定的激活码
  
- **删除账号**
  - 删除指定账号
  - 自动解绑激活码

#### 3️⃣ 使用日志

查看所有切换记录：
- 激活码
- 使用时间
- IP 地址
- SessionKey（脱敏）

#### 4️⃣ 自动解绑配置

设置账号自动解绑时间：
- 单位：小时
- 达到时间后自动删除该 SessionKey
- 防止长期占用激活码

![后台管理界面](https://via.placeholder.com/1200x800?text=Admin+Dashboard)

---

## ❓ 常见问题

### 1. 插件无法加载？

**检查清单：**
- [ ] 是否启用了浏览器的 "开发者模式"？
- [ ] 选择的文件夹是否包含 `manifest.json`？
- [ ] 是否使用 Chrome/Edge 浏览器（Firefox 不支持）？

**解决方法：**
```bash
# 重新编译插件
cd extension
npm run build
# 重新加载 extension/dist 文件夹
```

---

### 2. 切换账号失败：网络错误

**可能原因：**
- 后端 API 地址配置错误
- 后端服务未启动
- 防火墙阻止访问

**解决方法：**
1. 检查后端 API 地址是否正确
2. 测试后端连接：访问 `http://你的服务器地址/health`
3. 检查服务器防火墙：
   ```bash
   # 开放 3000 端口
   sudo ufw allow 3000
   ```

---

### 3. 激活码无效或已过期

**可能原因：**
- 激活码输入错误
- 激活码使用次数已用完
- 激活码已被删除

**解决方法：**
1. 仔细核对激活码（20 位字符）
2. 联系管理员检查激活码状态
3. 生成新的激活码

---

### 4. 无痕模式下切换失败

**可能原因：**
- 无痕模式下 cookie 设置需要更长时间生效

**解决方法：**
- 插件已支持自动重试（3 次，每次间隔递增）
- 如果仍然失败，请打开开发者工具（F12）查看控制台日志
- 将日志反馈给开发者

---

### 5. SessionKey 验证失败

**说明：**
```
❌ SessionKey 验证失败，此账号已失效（不扣除使用次数），请重试获取新账号
```

**原因：**
- 该账号的 SessionKey 已过期或被 Claude 官方封禁
- 账号 cookie 信息不完整

**处理：**
- **本次切换不扣除使用次数**
- 后台已自动清理该失效账号
- 重新切换会获取新账号

**管理员操作：**
1. 登录后台管理
2. 删除失效的 SessionKey
3. 添加新的有效账号

---

### 6. 数据库迁移失败

**错误信息：**
```
Error: Unknown column 'proxy' in 'field list'
```

**解决方法：**

在服务器上执行：

```bash
cd /root/auto-cookie

# 方式 1：自动修复脚本
bash backend/fix-proxy-field.sh

# 方式 2：手动添加字段
docker-compose exec db mysql -uroot -p
USE claude_switcher;
ALTER TABLE session_keys ADD COLUMN proxy VARCHAR(255) NULL;
EXIT;

# 重启后端
docker-compose restart backend
```

详细说明见：[PROXY_FIELD_FIX.md](./PROXY_FIELD_FIX.md)

---

## 🛠️ 技术栈

### 前端（插件）

- **TypeScript** - 类型安全的 JavaScript
- **Webpack** - 模块打包工具
- **Chrome Extension API** - 浏览器扩展 API
- **Content Script** - 页面上下文脚本

### 后端

- **Node.js** + **Express** - Web 服务器
- **TypeScript** - 类型安全
- **MySQL** - 关系型数据库
- **Docker** - 容器化部署

### 工具

- **ESLint** - 代码规范检查
- **Prettier** - 代码格式化
- **Jest** - 单元测试

---

## 📂 项目结构

```
auto-cookie/
├── extension/              # 浏览器插件
│   ├── src/
│   │   ├── background.ts   # 后台脚本（Service Worker）
│   │   ├── popup.ts        # 弹窗界面脚本
│   │   ├── options.ts      # 设置页脚本
│   │   └── verify-helper.ts # Content Script（验证助手）
│   ├── dist/               # 编译输出（安装此目录）
│   └── webpack.config.js   # Webpack 配置
│
├── backend/                # 后端服务
│   ├── src/
│   │   ├── routes/         # API 路由
│   │   ├── services/       # 业务逻辑
│   │   ├── database/       # 数据库相关
│   │   └── middleware/     # 中间件
│   └── package.json
│
├── admin.html              # 后台管理页面
├── docker-compose.yml      # Docker 编排
├── .env                    # 环境变量
└── README.md               # 本文档
```

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 开发流程

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/AmazingFeature`
3. 提交更改：`git commit -m 'Add some AmazingFeature'`
4. 推送分支：`git push origin feature/AmazingFeature`
5. 提交 Pull Request

### 代码规范

- 使用 ESLint 和 Prettier
- 提交前运行：`npm run lint` 和 `npm run format`
- 编写清晰的提交信息

---

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](./LICENSE) 文件。

---

## 📞 联系方式

- **GitHub Issues**: [提交问题](https://github.com/wp13461544040/auto-cookie/issues)
- **Email**: wp13461544040@gmail.com

---

## 🌟 Star History

如果这个项目对你有帮助，请给个 ⭐️ Star 支持一下！

[![Star History Chart](https://api.star-history.com/svg?repos=wp13461544040/auto-cookie&type=Date)](https://star-history.com/#wp13461544040/auto-cookie&Date)

---

<div align="center">

**[⬆ 回到顶部](#claude-账号一键切换插件)**

Made with ❤️ by [wp13461544040](https://github.com/wp13461544040)

</div>
