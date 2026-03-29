# Windows 编译问题与解决方案

## 问题

在 Linux 上编译 Windows 版本时，`sqlite3` 这个 native module 无法正确为 Windows 平台编译。

**原因：** sqlite3 是一个 C++ native module，需要为目标平台编译。在 Linux 上使用 gcc 无法生成 Windows PE 格式的二进制文件。

**错误信息：** `Cannot find module 'node_sqlite3.node'`

## 解决方案

### 方案 1：在 Windows 上编译（推荐）
最可靠的解决方案是在 Windows 系统上进行编译：
```bash
npm install
npm run dist
```

### 方案 2：修改应用使用纯 JavaScript SQLite
用如下实现替代 sqlite3：
- `sql.js` - 纯 JavaScript 实现，无需编译
- `better-sqlite3` - 有预编译的 Windows binaries

### 方案 3：创建 native module 预编译二进制（高级）
1. 在 Windows 上编译 sqlite3：`npm rebuild sqlite3 --build-from-source`
2. 将 `node_modules/sqlite3/lib/binding/napi-v6-win32-x64/node_sqlite3.node` 提交到项目
3. 在 Linux 编译时保留该文件

### 方案 4：使用 Docker Windows 容器（高级）
使用 Windows Docker 容器进行交叉编译。

## 临时解决方案

如果必须在 Linux 上为 Windows 编译，可以：
1. 修改 `main.js`，添加 sqlite3 加载的 try-catch
2. 提供应用内通知，告诉用户需要在 Windows 上重新安装依赖

## 当前状态

- ✅ Linux x86 版本：正常工作
- ✅ Linux ARM64 版本：正常工作
- ❌ Windows 版本：sqlite3 native module 缺失

## 推荐行动

建议在 Windows 系统（或 Windows Docker 容器）上重新编译 Windows 版本。
