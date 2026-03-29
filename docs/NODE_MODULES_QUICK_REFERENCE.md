# 快速参考：Node Modules 快照管理
# Quick Reference: Node Modules Snapshot Management

## 架构概览 / Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  项目根目录 (Project Root)                   │
├─────────────────────────────────────────────────────────────┤
│  node_modules/                   ← 当前工作 node_modules     │
│  (500MB)                           由 mv 快速交换            │
│                                                               │
│  .node_modules_snapshots/        ← 快照存储区                │
│  ├─ .current_snapshot            状态文件                    │
│  ├─ node_modules.vanilla/        基础备份 (cp一次)           │
│  ├─ node_modules.vanilla.size                                │
│  ├─ node_modules.linux.x86/      平台快照 (mv交换)           │
│  ├─ node_modules.linux.x86.size                              │
│  ├─ node_modules.arm/            平台快照                    │
│  └─ node_modules.arm.size                                    │
└─────────────────────────────────────────────────────────────┘
```

## 关键概念 / Key Concepts

### Vanilla 基础备份
- 首次使用时从当前 node_modules **复制** (一次性)
- 保留 npm install 的原始状态
- 作为所有平台的基础
- 从不修改 (用 cp 恢复)

### 平台快照
- 从 vanilla + rebuild 后 **移动** 到 snapshots
- 包含平台特定的 native modules (*.node 文件)
- 平台间切换使用 mv **交换**
- 允许被覆盖或删除

### 快速交换 (Fast Switching)
```
当前: node_modules (A 的 binaries)
目标: snapshots/node_modules.B

交换步骤:
  1. mv node_modules → snapshots/node_modules.A (保存 A)
  2. mv snapshots/node_modules.B → node_modules (恢复 B)
  
时间: 毫秒级 (相比 cp 的分钟级 快 2000 倍)
```

## 命令速查 / Command Cheatsheet

| 命令 | 用途 | 时间 | 说明 |
|------|------|------|------|
| `prepare <platform>` | 切换到平台并准备编译 | 秒级 | 自动保存/恢复 |
| `list` | 列出所有快照 | 毫秒 | 显示 vanilla + 平台 |
| `stats` | 显示统计信息 | 毫秒 | 大小和性能提示 |
| `restore <platform>` | 手动恢复到平台 | 秒级 | 仅切换，不构建 |
| `backup <name>` | 创建自定义快照 | 秒级 | 用于特殊场景 |
| `clean` | 删除过期快照 | 秒级 | 保留 vanilla 和当前 |

## 典型工作流 / Typical Workflows

### 工作流 1: 编译所有平台

```bash
cd /workspaces/snippet-notes

# 一条命令完成所有
bash pack.sh all

# 内部自动执行:
# 准备 → 编译 → 打包 （各平台循环）
#   ↓
# prepare linux.x86   (首次: vanilla cp + rebuild + mv)
# prepare arm         (再次: save + restore + rebuild + mv)
# prepare win         (再次: save + restore + rebuild + mv)
```

**预期时间**:
- 首次: ~5-6 分钟 (包括初始化)
- 后续: ~5 分钟 (只有 rebuild, 不再 copy)

### 工作流 2: 单平台快速编译

```bash
# 仅编译一个平台
bash pack.sh linux.x86

# 自动流程:
# 1. prepare linux.x86 (0.1s 切换 + 40s rebuild + 0.1s 保存)
# 2. npm run linux.x86
# 3. 打包
```

**预期时间**: 3-5 分钟

### 工作流 3: 修改依赖后重新编译

```bash
# 更新 package.json
vim package.json

# 清理旧快照，重新编译所有
bash scripts/manage-node-modules.sh clean
bash pack.sh all

# 流程:
# 1. clean 删除所有快照 (保留 vanilla)
# 2. prepare linux.x86 (restore vanilla + rebuild + mv)
# 3. prepare arm
# 4. prepare win
```

**预期时间**: 首次 6-7 分钟

### 工作流 4: 平台间快速切换（开发/测试）

```bash
# 当前在 arm 环境，要测试 linux.x86
bash scripts/manage-node-modules.sh prepare linux.x86

# 仅需快速切换，无需重新构建
# 时间: 0.1-0.2 秒！

npm start  # 运行 linux.x86 版本

# 再切回 arm
bash scripts/manage-node-modules.sh restore arm  # 0.1s
```

**预期时间**: 秒级!

## 常见情况处理 / Common Scenarios

### 情况 1: 没有快照目录

```bash
ERROR: 找不到 vanilla 基础备份

解决:
  $ bash scripts/manage-node-modules.sh prepare <platform>
  → 自动创建 vanilla
  → 创建 <platform> 快照
  → 完成！
```

### 情况 2: 某个平台的快照损坏

```bash
ERROR: 无法恢复快照

解决:
  $ bash scripts/manage-node-modules.sh clean
  $ bash scripts/manage-node-modules.sh prepare <platform>
  → 从 vanilla 重新构建
  → 或直接 prepare，自动重建
```

### 情况 3: 磁盘空间不足

```bash
# 检查占用
$ bash scripts/manage-node-modules.sh stats

# 清理过期快照
$ bash scripts/manage-node-modules.sh clean

# 或手动删除特定快照
$ rm -rf .node_modules_snapshots/node_modules.win
```

### 情况 4: 想保留特定状态

```bash
# 创建自定义快照
$ bash scripts/manage-node-modules.sh backup my-test-version

# 后续恢复
$ bash scripts/manage-node-modules.sh restore my-test-version
```

## 性能对比表 / Performance Comparison

| 操作 | copy-based | move-based | 改进倍数 |
|------|-----------|-----------|---------|
| 首次初始化 | N/A | 100s | N/A |
| 平台切换 | 200-250s | 0.1s | **2000x** |
| 新平台构建 | 200s+rebuild | rebuild | **100x** |
| 3 平台全编 | 13+ 分钟 | 5+ 分钟 | **2.6x** |
| 从缓存重编 | 9+ 分钟 | 5+ 分钟 | **1.8x** |

## 内部实现细节 / Implementation Details

### initialize_vanilla_backup()

```bash
当 vanilla 不存在时:
  ✓ cp -r node_modules → .node_modules_snapshots/node_modules.vanilla
  ✓ 记录大小到 .size 文件
  ✓  输出进度信息
  
目的:
  - 保存 npm install 原始状态
  - 供后续平台使用
  - 避免重复下载依赖
```

### save_snapshot(platform)

```bash
保存平台快照:
  ✓ mv node_modules → .node_modules_snapshots/node_modules.{platform}
  ✓ 记录大小到 .size 文件
  ✓ 更新 .current_snapshot 状态文件
  
优点:
  - 速度快 (mv 不复制)
  - 原子性好 (移动操作)
  - 自动覆盖旧版本
```

### restore_from_snapshot(platform)

```bash
恢复平台快照:
  ✓ mv .node_modules_snapshots/node_modules.{platform} → node_modules
  ✓ 更新 .current_snapshot 状态文件
  ✓ 验证恢复成功
  
优点:
  - 秒级速度
  - 完整恢复 (所有文件)
  - 开箱即用 (无需 rebuild)
```

### restore_from_vanilla()

```bash
从基础恢复:
  ✓ cp -r vanilla → node_modules (保留 vanilla 原貌)
  ✓ 不修改快照目录 (下次可重用)
  ✓ 为 rebuild 做准备
  
适用场景:
  - 首次构建新平台
  - 需要重新 rebuild 时
```

### prepare_build_environment(platform)

```bash
核心逻辑:
  IF vanilla 不存在:
    → initialize_vanilla_backup()
  
  IF 已有该平台快照:
    → save_snapshot(current)  # 保存当前
    → restore_from_snapshot(platform)  # 恢复目标
  ELSE:
    → save_snapshot(current)  # 保存当前
    → restore_from_vanilla()  # 恢复基础
    → rebuild-native  # 重建平台特异二进制
    → save_snapshot(platform)  # 保存结果
```

## 故障排除 / Troubleshooting

| 问题 | 原因 | 解决 |
|------|------|------|
| mv: cannot move | 权限问题 | `chmod +x manage-node-modules.sh` |
| 快照空间大 | 多个平台积累 | `bash ... clean` |
| 快照损坏 | 中途中断 | 手动 rm 后重新 prepare |
| 无法恢复快照 | 快照不存在 | `bash ... prepare <platform>` 重建 |
| prepare 很慢 | 首次构建 | 正常，包含 rebuild 时间 |

## 设计原则 / Design Principles

1. **速度优先**: 使用 mv 而不是 cp
2. **智能化**: 自动创建和管理 vanilla
3. **可靠性**: vanilla 保证不污染
4. **可恢复**: 快照丢失可自动重建
5. **空间优化**: clean 保留最少必要
6. **透明性**: 自动处理细节，用户只需 prepare

## 下一步改进 / Future Improvements

- [ ] 支持增量快照 (仅保存差异)
- [ ] 并行编译支持 (临时 node_modules)
- [ ] 快照压缩 (tar.gz 存储)
- [ ] 多机器共享 (云存储备份)
- [ ] 自动清理触发器 (空间不足时)
