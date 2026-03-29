# 多平台构建 - Node Modules 管理指南
# Multi-Platform Build - Node Modules Management Guide

## 问题背景 / Background

在 Linux 系统上进行多平台交叉编译时，所有平台都共享同一份 `node_modules` 目录。当编译 native modules (如 `sqlite3`) 时，会产生以下问题：

```
编译顺序:
  1. Linux x86  → node_modules 中的 sqlite3 binaries 是 x86 的
  2. ARM64      → node_modules 中的 sqlite3 binaries 被覆盖为 ARM64 的
  3. Windows    → node_modules 中没有 Windows binaries (在 Linux 上无法编译)

打包结果:
  ❌ Windows 版本包含 Linux binaries (运行时失败)
  ✓ ARM64 版本包含正确的 ARM64 binaries
  ❌ Linux x86 版本包含 ARM64 binaries (运行时失败)
```

## 解决方案 / Solution

### 自动管理方案 (推荐) / Automatic Management (RECOMMENDED)

使用 `scripts/manage-node-modules.sh` 脚本自动管理每个平台的 node_modules 快照。

#### 工作原理

```
初次编译平台 A:
  1. rebuild-native.js 为平台 A 编译 native modules
  2. 备份编译后的 node_modules 为 "node_modules.A"
  
编译另一个平台 B:
  1. 检查是否有平台 B 的备份
  2. 如果有: 恢复备份的 node_modules.B
  3. 如果没有: 为平台 B 编译并创建备份

结果:
  ✓ 每个平台有专属的 node_modules 副本
  ✓ 编译顺序不重要
  ✓ 打包时使用对应平台的正确 binaries
```

## 使用方法 / Usage

### 自动管理（pack.sh 集成）

```bash
# 编译所有平台（使用新的自动管理）
bash pack.sh all

# 仅编译某个平台
bash pack.sh linux.x86
bash pack.sh arm
bash pack.sh win
```

流程说明：
1. `pack.sh` 调用 `manage-node-modules.sh prepare <platform>`
2. 脚本检查该平台是否有备份
3. 如果有备份：恢复该备份
4. 如果无备份：执行 `rebuild-native.js`，然后备份结果
5. 执行构建命令 (`npm run dist` 等)
6. 打包输出

### 手动管理

#### 准备特定平台的构建环境
```bash
bash scripts/manage-node-modules.sh prepare <platform>
```

supported platforms: `win`, `linux.x86`, `arm`

**示例**:
```bash
# 为 Windows 构建准备环境
bash scripts/manage-node-modules.sh prepare win

# 为 ARM 构建准备环境
bash scripts/manage-node-modules.sh prepare arm
```

首次运行时，脚本会：
1. 执行 `rebuild-native.js <platform>`
2. 为该平台编译 native modules
3. 备份编译后的 node_modules

后续运行时，脚本会：
1. 检查是否已有备份
2. 自动恢复该备份到 node_modules

#### 列出所有备份
```bash
bash scripts/manage-node-modules.sh list
```

**输出示例**:
```
[node_modules] 已有的 node_modules 备份：
  * arm (512M) [当前]
  - linux.x86 (488M)
  - win (500M)
```

当前标记 `*` 表示 node_modules 当前是该平台的版本。

#### 显示统计信息
```bash
bash scripts/manage-node-modules.sh stats
```

**输出示例**:
```
[node_modules] node_modules 统计：
  当前版本: arm
  当前大小: 512M
  备份总大小: 1.5G
  备份个数: 3
```

#### 恢复到特定平台
```bash
bash scripts/manage-node-modules.sh restore <platform>
```

**示例**:
```bash
# 恢复到 Linux x86 的环境
bash scripts/manage-node-modules.sh restore linux.x86
```

#### 手动备份当前环境
```bash
bash scripts/manage-node-modules.sh backup <name>
```

**示例**:
```bash
# 备份当前的 node_modules 为 "my-custom-version"
bash scripts/manage-node-modules.sh backup my-custom-version
```

#### 清理过期备份
```bash
bash scripts/manage-node-modules.sh clean
```

清理除当前版本外的所有备份，节省磁盘空间。

## 文件结构 / File Structure

```
.node_modules_snapshots/          # 备份目录 (被 .gitignore 忽略)
  ├── .current_snapshot            # 记录当前版本
  ├── node_modules.win/            # Windows 平台的 node_modules 备份
  ├── node_modules.win.size        # Windows 备份大小
  ├── node_modules.linux.x86/      # Linux x86 平台的备份
  ├── node_modules.linux.x86.size  # Linux x86 备份大小
  ├── node_modules.arm/            # ARM64 平台的备份
  └── node_modules.arm.size        # ARM64 备份大小

node_modules/                      # 当前工作目录
  └── ... (symlink 或副本指向当前平台的版本)
```

## 常见问题 / FAQ

### Q: 为什么需要备份 node_modules？
A: 因为在 Linux 上编译的 native modules 只能在 Linux 上运行。不同平台的 node_modules 中的 native modules (`.node` 文件) 是不同的。

### Q: 备份占用很多磁盘空间，怎么办？
A: 使用 `clean` 命令删除不需要的备份：
```bash
bash scripts/manage-node-modules.sh clean
```

### Q: 如果我只想编译某个平台，需要备份所有的吗？
A: 不需要。只有首次编译该平台时才会创建备份。之后使用现有备份。

### Q: 可以并行编译不同平台吗？
A: 不建议。并行编译会导致 node_modules 目录冲突。建议按顺序编译。

### Q: Windows 版本为什么不能在 Linux 上编译？
A: `sqlite3` 是 C++ native module，需要 MSVC 编译器。Linux 上的 gcc 无法生成 Windows 二进制。需要在 Windows 或使用 Wine (但效果有限)。

### Q: 我的旧的打包输出还能用吗？
A: 不能。旧的 Windows/Linux x86 版本包含了错误的 sqlite3 binaries。需要使用新的构建流程重新打包。

## 工作流示例 / Workflow Example

### 完整的多平台编译和打包流程

```bash
# 初始化（仅需一次）
npm install

# 编译并打包所有平台（新的自动管理方案）
bash pack.sh all

# 进度显示:
# [pack] 开始编译 Linux x86 版本...
# [node_modules] 为 Linux x86 准备 node_modules 环境...
# [node_modules] 首次为 linux.x86 构建...
# [node_modules] ✓ 备份完成: 488M
# ... (编译过程)
# 
# [pack] 开始编译 Linux ARM64 版本...
# [node_modules] 为 arm 准备 node_modules 环境...
# [node_modules] ✓ 恢复完成: 512M
# ... (编译过程)
#
# [pack] 开始编译 Windows x64 版本...
# [node_modules] 为 win 准备 node_modules 环境...  
# [node_modules] 首次为 win 构建...
# [node_modules] ✓ 备份完成: 500M
# ... (编译过程)
```

### 仅编译 Linux x86

```bash
bash pack.sh linux.x86

# 自动执行：
# 1. 检查是否有 linux.x86 备份
# 2. 如果有，恢复备份；如果没有，创建备份
# 3. 执行 npm run linux.x86
# 4. 打包成 snippet-notes-linux-x86-*.tar.gz
```

## 故障排除 / Troubleshooting

### 问题: 编译时出现"bindings not found"错误

**原因**: node_modules 被损坏

**解决**:
```bash
# 恢复到正确的平台
bash scripts/manage-node-modules.sh list          # 查看备份
bash scripts/manage-node-modules.sh restore win   # 恢复你要编译的平台
npm install                                        # 重新安装
```

### 问题: 磁盘空间不足

**解决**:
```bash
# 删除所有旧备份，只保留当前版本
bash scripts/manage-node-modules.sh clean

# 或者手动删除特定备份
rm -rf .node_modules_snapshots/node_modules.win/
```

### 问题: 脚本无法执行权限

**解决**:
```bash
chmod +x scripts/manage-node-modules.sh
```

## 指标汇总 / Summary

| 指标 | 之前 | 之后 |
|------|------|------|
| 编译顺序依赖 | ⚠️ 有风险 | ✅ 无关系 |
| native modules 正确性 | ❌ 容易出错 | ✅ 自动管理 |
| Windows 版本质量 | ❌ 失败 | ✅ 工作 |
| Linux x86 编译顺序 | ❌ 易被覆盖 | ✅ 独立备份 |
| 磁盘使用 | 488M | ~1.5G (3个平台) |
| 获取性 | 自动 | 自动 |

建议定期运行 `clean` 命令清理备份，保持磁盘健康。
