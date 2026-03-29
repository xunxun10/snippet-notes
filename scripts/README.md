# Build Scripts Configuration System
# 构建脚本配置系统

## Overview / 概述

This directory contains build and configuration scripts for the snippet-notes Electron application. All scripts now use a centralized configuration module (`config.js`) to eliminate hardcoded version numbers and platform-specific values.

此目录包含 snippet-notes Electron 应用的构建和配置脚本。所有脚本现在都使用集中式配置模块 (`config.js`) 来消除硬编码的版本号和特定于平台的值。

## Configuration Module / 配置模块

### File: `config.js`

The `config.js` module is the single source of truth for all version and platform information. It reads configuration dynamically from `package.json` and provides utility functions for all build scripts.

`config.js` 模块是所有版本和平台信息的唯一真实来源。它从 `package.json` 动态读取配置，并为所有构建脚本提供实用函数。

### Available Functions / 可用函数

```javascript
const config = require('./config');

// Get project name, version, and root directory
// 获取项目名称、版本和根目录
const { name, version, projectRoot } = config.getProjectConfig();

// Get specific dependency version from package.json
// 从 package.json 获取特定依赖的版本
const sqlite3Version = config.getDependencyVersion('sqlite3');
const electronVersion = config.getDependencyVersion('electron');

// Get native module configuration
// 获取 native module 配置
const sqlite3Config = config.getNativeModuleConfig('sqlite3');
// Returns: { napiVersion: 'napi-v6', targets: [...] }

// Get all build targets configuration
// 获取所有构建目标的配置
const targets = config.getBuildTargets();
// Returns: { win: {...}, linux_x86: {...}, arm: {...} }

// Get output filename for a specific target
// 获取特定目标的输出文件名
const filename = config.getOutputName('win');
// Returns: 'snippet-notes-win32-x64'
```

## Built-in Scripts / 内置脚本

### 1. `pack.sh` - Master Build Script
### 1. `pack.sh` - 主构建脚本

Builds and packages the application for all supported platforms with automatic node_modules management.

为所有支持的平台构建和打包应用程序，具有自动 node_modules 管理。

**Usage**:
```bash
bash pack.sh [target] [options]
```

**Targets**:
- `win` - Build Windows x64 version
- `linux.x86` - Build Linux x86 version
- `arm` - Build Linux ARM64 version
- `all` - Build all platforms (same as `npm run all`)

**Features**:
- ✅ Dynamically reads project name and version from `package.json` (via `config.js`)
- ✅ Uses configuration arrays instead of hardcoded platform names
- ✅ **NEW: Automatic node_modules management** - Manages platform-specific native modules
- ✅ Supports cross-compilation on Linux
- ✅ Automatically packages compiled output

**Key Improvement**: 
Now intelligently manages `node_modules` for each platform. When building:
1. Detects if this platform's `node_modules` exists as a backup
2. Restores the backup if available
3. If first build for this platform, rebuilds and backs up
4. Ensures each platform gets correct native modules

### 2. `download-sqlite3-win.js` - Windows SQLite3 Binary Downloader
### 2. `download-sqlite3-win.js` - Windows SQLite3 二进制下载器

Prepares Windows sqlite3 native binaries for the Windows build.

为 Windows 构建准备 Windows sqlite3 native binaries。

**Changes**:
- ✅ `SQLITE3_VERSION` now reads from `config.getDependencyVersion('sqlite3')`
- ✅ `NAPI_VERSION` now reads from `config.getNativeModuleConfig('sqlite3')`
- ✅ Project root path now reads from `config.getProjectConfig().projectRoot`

### 3. `rebuild-native.js` - Native Module Rebuild Script
### 3. `rebuild-native.js` - Native Module 重新构建脚本

Intelligently handles native module rebuilds: only performs special cross-compilation handling when target platform ≠ current platform.

智能处理 native module 重建：只有在目标平台 ≠ 当前平台时才进行特殊的交叉编译处理。

**Usage**:
```bash
node scripts/rebuild-native.js [targetPlatform]
```

**Supported Target Platforms**:
- `current` (default) - Rebuilds for current platform only
- `linux.x86` - Linux x86-64
- `arm` - Linux ARM64
- `win` / `win32` - Windows x64

**Smart Platform Detection**:
- ✅ Automatically detects current platform
- ✅ Compares with target platform
- ✅ If platforms **match**: Uses simple `npm rebuild sqlite3`
- ✅ If platforms **mismatch**: Cleans incompatible bindings and handles cross-compilation
- ✅ Windows targets provide helpful guidance (cannot cross-compile from Linux)

**Changes**:
- ✅ Platform matching logic - only rebuilds when needed
- ✅ Standardized platform naming with platform maps
- ✅ Better error messages and platform detection
- ✅ Project root path reads from `config.getProjectConfig().projectRoot`

### 4. `manage-node-modules.sh` - Node Modules Snapshot Manager
### 4. `manage-node-modules.sh` - Node Modules 快照管理器

**NEW**: Manages platform-specific node_modules snapshots to ensure each platform gets correct native modules.

**新增**: 管理特定于平台的 node_modules 快照，确保每个平台获得正确的 native modules。

**Usage**:
```bash
bash scripts/manage-node-modules.sh <command> [options]
```

**Commands**:
- `prepare <platform>` - Prepare build environment (automatically backup/restore)
- `backup <name>` - Backup current node_modules
- `restore <platform>` - Restore specific platform's node_modules
- `list` - List all available backups
- `clean` - Delete outdated backups (keeps only current)
- `stats` - Show statistics
- `help` - Show help

**Examples**:
```bash
# Prepare for Windows build (first time: rebuild + backup, subsequent: restore from backup)
bash scripts/manage-node-modules.sh prepare win

# List all snapshots
bash scripts/manage-node-modules.sh list

# Restore Linux x86 environment
bash scripts/manage-node-modules.sh restore linux.x86

# Show current state
bash scripts/manage-node-modules.sh stats

# Clean old backups
bash scripts/manage-node-modules.sh clean
```

**Features**:
- ✅ Automatic snapshot creation on first build
- ✅ Intelligent restoration - switches platforms transparently
- ✅ Tracks current active snapshot
- ✅ Shows backup sizes
- ✅ Supports unlimited platforms

**Why Needed?**:
When cross-compiling on Linux, different platforms' native modules are incompatible. This script ensures:
1. Windows build gets Windows-compatible binaries (or appropriate fallback)
2. ARM build gets ARM-specific binaries
3. Linux x86 build gets x86-specific binaries
4. Build order doesn't matter - each platform's binaries are preserved

## Version Management / 版本管理

All scripts automatically use versions defined in `package.json`. When you update the version:

所有脚本都会自动使用 `package.json` 中定义的版本。当您更新版本时：

```json
{
  "name": "snippet-notes",
  "version": "0.5.3",
  "dependencies": {
    "sqlite3": "^5.1.6",
    "electron": "^22.0.0"
  }
}
```

1. **No need to update scripts** - Scripts automatically read the new version
2. **All builds will use the new version** - pack.sh, download-sqlite3-win.js, etc. all read from config.js

## Platform Targets / 平台目标

Configuration for each platform is defined in `config.js`:

每个平台的配置都在 `config.js` 中定义：

| Target | Platform | Architecture | Output Directory |
|--------|----------|--------------|------------------|
| `win` | Windows | x64 | `dist/` |
| `linux.x86` | Linux | x86-64 | `linux-x86/` |
| `arm` | Linux | ARM64 | `linux-arm64/` |

## Adding New Scripts / 添加新脚本

When creating new build scripts, always:

创建新的构建脚本时，请始终：

1. **Import config module at the top**:
   ```javascript
   const config = require('./config');
   ```

2. **Get configuration dynamically**:
   ```javascript
   const { name, version, projectRoot } = config.getProjectConfig();
   const sqlite3Ver = config.getDependencyVersion('sqlite3');
   ```

3. **Avoid hardcoding**:
   ❌ `const VERSION = '0.5.3'`
   ✅ `const VERSION = config.getProjectConfig().version`

4. **Use helper functions**:
   ❌ `const outputName = 'snippet-notes-win32-x64'`
   ✅ `const outputName = config.getOutputName('win')`

## Troubleshooting / 故障排除

### Scripts can't find `config.js`
Make sure scripts are located in the `scripts/` directory and use:
```javascript
const config = require('./config');
```

### Version not updating
Check `package.json` to ensure the version is set correctly. Scripts will automatically read the new version on next run.

### Native module path issues
Always use `config.getProjectConfig().projectRoot` instead of `__dirname` or hardcoded paths.

## Example: Updating SQLite3 Version / 示例：更新 SQLite3 版本

Before (hardcoded):
```javascript
const SQLITE3_VERSION = '5.1.6';
// Need to manually update this in multiple files
```

After (centralized):
```javascript
const SQLITE3_VERSION = config.getDependencyVersion('sqlite3');
// Automatically reads from package.json, no manual updates needed
```

Simply update `package.json`:
```json
"dependencies": {
  "sqlite3": "^5.2.0"
}
```

All scripts will automatically use version 5.2.0 on next run.
