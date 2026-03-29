# 交叉编译问题分析与解决方案
# Cross-Compilation Issue Analysis and Solution

## 问题描述 / Problem Description

当前的构建流程存在以下问题：

1. **所有平台共享同一个 node_modules 目录** - 每个平台编译时都修改同一份 native modules
2. **编译后没有保存结果** - 上一个平台的 binaries 会被下一个平台覆盖
3. **打包时包含错误的 binaries** - Windows 版本打包时获得的是 Linux binaries

### 证据 / Evidence

```bash
# Windows 版本包含的 sqlite3 binding:
snippet-notes-win32-x64-0.5.3.tar.gz 包含:
  - napi-v6-linux-glibc-x64/node_sqlite3.node  ❌ 错误 (Linux binary)
  - napi-v6-linux-glibc-arm64/node_sqlite3.node ❌ 错误 (Linux binary)
  
# 应该包含:
  - napi-v6-win32-x64/node_sqlite3.node  ✅ 正确 (Windows binary)
```

## 为什么会这样 / Root Cause

```
步骤 1: 编译 Linux x86
        → rebuild-native.js linux.x86
        → node_modules/sqlite3/ 现在包含 x86 binaries

步骤 2: 编译 ARM64
        → rebuild-native.js arm
        → node_modules/sqlite3/ 现在包含 ARM64 binaries (x86 被覆盖)

步骤 3: 编译 Windows
        → rebuild-native.js win
        → 清理所有 binding (因为在 Linux 上无法编译 Windows)
        → 打包时: node_modules/sqlite3/ 中没有任何 binding
        → electron-builder 从源构建或使用缓存
        → 结果是最后一个 Linux 编译的 binaries (ARM64 或 x86)

打包结果: Windows 版本包含 Linux binaries ❌✗✗✗
```

## 解决方案 / Solutions

### 方案 1: 为每个平台保存 node_modules 副本 (推荐)
### Solution 1: Save node_modules snapshots for each platform (RECOMMENDED)

**优点**：
- 简单直接
- 每个平台有独立的编译环境
- 支持并行编译

**实现步骤**：

```bash
# 1. 初始化时保存原始 node_modules
npm install
cp -r node_modules node_modules.vanilla

# 2. 编译各平台
# Platform 1: Linux x86
npm rebuild sqlite3
cp -r node_modules node_modules.linux-x86

# Platform 2: ARM64
npm rebuild sqlite3 --arch=arm64
cp -r node_modules node_modules.arm64

# Platform 3: Windows
# (无法在 Linux 编译，使用 vanilla)
cp -r node_modules.vanilla node_modules

# 打包前恢复正确的 node_modules
cp -r node_modules.${target} node_modules
npm run build-${target}
```

### 方案 2: 智能清理并保留多个 platform bindings
### Solution 2: Keep multiple platform bindings

修改 `rebuild-native.js` 保留多个平台的 bindings，而不是清理：

```javascript
// 而不是清理整个 binding 目录
const bindingDir = path.join(sqliteDir, 'lib/binding');
if (fs.existsSync(bindingDir)) {
  execSync(`rm -rf ${bindingDir}`, { stdio: 'inherit' });
}

// 改为只清理当前平台的 bindings
const bindingDir = path.join(sqliteDir, 'lib/binding');
const currentPlatformBinding = `napi-v6-${currentPlatformString}`;
if (fs.existsSync(bindingDir)) {
  // 删除这个平台的旧 bindings 但保留其他平台的
  execSync(`rm -rf ${path.join(bindingDir, currentPlatformBinding)}`, { stdio: 'inherit' });
}
```

但这有问题：electron-builder 会打包所有平台的 bindings，导致包很大。

### 方案 3: 按平台创建独立构建目录
### Solution 3: Independent build directories per platform

```bash
# 为每个平台创建独立的工作目录
mkdir -p build/win build/linux-x86 build/arm

# 在各自的目录中编译
cd build/win && npm install && npm rebuild sqlite3 && npm run dist

# 最终合并
```

这最复杂，但更激进。

## 推荐实现 / Recommended Implementation

**最简单且最可靠的方案是 方案 1**。

需要修改：

1. `pack.sh` - 在构建前保存/恢复 node_modules
2. `scripts/rebuild-native.js` - 在保存前执行清理
3. `.gitignore` - 忽略 node_modules 备份

### 实现细节 / Implementation Details

```bash
# 状态管理文件
CURRENT_BINDINGS_HASH="linux-x86"  # 记录当前 node_modules 是哪个平台的

# 构建前检查和恢复
prepare_node_modules() {
  local target=$1
  local bindings_backup="node_modules.${target}.backup"
  
  if [ ! -d "$bindings_backup" ]; then
    # 首次编译该平台，需要编译
    node scripts/rebuild-native.js $target
    cp -r node_modules "$bindings_backup"
  else
    # 已有备份，直接恢复
    rm -rf node_modules
    cp -r "$bindings_backup" node_modules
  fi
}

# 在 pack.sh 中使用
pack_target() {
  local target=$1
  prepare_node_modules $target
  npm run build-$target
}
```

## 立即修复 / Immediate Fix

使用当前的打包结果有问题吗？

**是的**，Windows 版本无法运行，因为包含了 Linux binaries。

需要立即采取的行动：

1. **删除现有的错误包** (可选)
2. **实施方案 1** - 保存 node_modules 备份
3. **重新编译**

## 长期建议 / Long-term Recommendations

1. 使用 Docker 或虚拟机为每个平台编译
2. 使用 CI/CD 在对应平台上编译
3. 基于云的构建系统 (GitHub Actions/GitLab CI)
4. 或者在 Windows 机器上手动编译 Windows 版本
