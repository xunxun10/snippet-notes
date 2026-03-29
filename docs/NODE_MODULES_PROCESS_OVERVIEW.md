# Node Modules 快照管理系统 - 流程说明
# Node Modules Snapshot Management - Process Overview

## 核心概念 (3 层结构)

```
┌─────────────────────────────────────────────────────────────┐
│ 第 1 层: 工作目录                                             │
│ ─────────────────────────────────────────────────────────────│
│ node_modules/                                                │
│   ├─ .platform  ← 记录当前平台 (简单文件，内容: "linux.x86") │
│   └─ [npm packages + native modules]                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 第 2 层: 快照存储                                             │
│ ─────────────────────────────────────────────────────────────│
│ .node_modules_snapshots/                                    │
│   ├─ node_modules.vanilla/  ← 基础副本 (npm 包原始状态)     │
│   ├─ node_modules.linux.x86/  ← 平台 A (x86 native)        │
│   └─ node_modules.arm/        ← 平台 B (arm native)        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 第 3 层: 构建脚本                                             │
│ ─────────────────────────────────────────────────────────────│
│ scripts/manage-node-modules.sh                              │
│ scripts/rebuild-native.js                                   │
│ pack.sh                                                      │
└─────────────────────────────────────────────────────────────┘
```

## 核心流程 (3 种场景)

### 场景 1: 首次构建平台 (第一次编译 A 平台)

```
开始: node_modules.vanilla 不存在

步骤 1️⃣: 初始化 Vanilla
  当前的 node_modules (npm install 后的原始状态)
    ↓ cp (复制一次，一次性成本)
  .node_modules_snapshots/node_modules.vanilla/
  └─ 保存 npm 包原始状态 (此后不再修改)
  
步骤 2️⃣ 构建平台 A (Linux x86)
  node_modules.vanilla
    ↓ cp (快速恢复基础)
  node_modules
    ↓ rebuild-native.js (仅重建 .node 文件)
  node_modules (现在有 x86 特定的 native modules)
    ↓ mv (快速保存，0.1s)
  .node_modules_snapshots/node_modules.linux.x86/
  
步骤 3️⃣: 记录状态
  写入 node_modules/.platform = "linux.x86"
  └─ 简单文件，避免复杂的状态管理

完成: 
  ✓ vanilla 保存了 npm 包 (永久保留)
  ✓ linux.x86 保存了平台特定 native
  ✓ node_modules 现在是 linux.x86 的副本
  ✓ node_modules/.platform = "linux.x86"
```

**时间**: ~150 秒 (100s init + 40s rebuild + 10s mv)

### 场景 2: 新平台切换 (从 A 平台切到 B 平台)

```
当前: node_modules 是 A (linux.x86), .platform = "linux.x86"
目标: 切换到 B (arm)

步骤 1️⃣: 保存当前平台 A
  node_modules (A 的 native modules)
    ↓ mv (快速保存，0.05s)
  .node_modules_snapshots/node_modules.linux.x86/
  └─ 创建或覆盖 A 的快照

步骤 2️⃣: 恢复 Vanilla 基础
  .node_modules_snapshots/node_modules.vanilla
    ↓ cp (快速恢复基础，100s)
  node_modules
  └─ 现在是原始的 npm 包

步骤 3️⃣: 构建平台 B
  node_modules
    ↓ rebuild-native.js (仅重建 .node 文件)
  node_modules (现在有 arm 特定的 native)

步骤 4️⃣: 保存平台 B
  node_modules
    ↓ mv (快速保存，0.05s)
  .node_modules_snapshots/node_modules.arm/

步骤 5️⃣: 记录状态
  写入 node_modules/.platform = "arm"

完成:
  ✓ 旧平台 A 快照保留 (.node_modules_snapshots)
  ✓ 新平台 B 已准备好
  ✓ node_modules 现在是 B 的副本
  ✓ node_modules/.platform = "arm"
```

**时间**: ~110 秒 (0.05s 保存 + 100s cp vanilla + 90s rebuild + 0.05s 保存)

### 场景 3: 平台已有，快速切换 (从 A 切到 B，B 已有快照)

```
当前: node_modules 是 A (linux.x86), .platform = "linux.x86"
目标: 切换到 B (已有快照)

步骤 1️⃣: 快速保存当前 A
  node_modules
    ↓ mv (0.05s)
  .node_modules_snapshots/node_modules.linux.x86

步骤 2️⃣: 快速恢复 B
  .node_modules_snapshots/node_modules.arm
    ↓ mv (0.05s)
  node_modules
  └─ 完整恢复，包括 B 的 native modules

步骤 3️⃣: 更新状态
  写入 node_modules/.platform = "arm"

完成:
  ✓ 零构建 (仅切换快照)
  ✓ 无需 rebuild
  ✓ node_modules 现在是 B
  ✓ node_modules/.platform = "arm"
```

**时间**: 0.1 秒 (仅 mv 操作)

---

## 关键操作详解

### 1. 初始化 (initialize_vanilla_backup)

```bash
首次使用 bash pack.sh all 时:
  
  检查: vanilla 是否存在?
    ├─ 存在 → 跳过初始化，复用
    └─ 不存在 → 进行初始化
        ├─ cp -r node_modules → vanilla (完整复制)
        ├─ 记录大小到 vanilla.size
        └─ 输出进度信息
  
  目的:
    - 捕获原始的 npm 包状态
    - 供所有平台复用 (避免 npm install 重复)
    - 一次性成本，后续通过 vanilla 快速恢复
```

### 2. 保存快照 (save_snapshot)

```bash
完成该平台的 rebuild 后:

  操作: mv node_modules → snapshots/node_modules.{platform}
  
  实际执行:
    1. mv 移动 node_modules 到快照目录 (0.05s)
    2. 删除旧快照如果存在
    3. 记录大小到 .size 文件
    4. 写入 node_modules/.platform = "{platform}"
  
  优点:
    - 速度快 (mv 不复制，仅改变指针)
    - 原子性好 (要么完全成功，要么失败)
    - node_modules 消失 (为下一步做准备)
```

### 3. 恢复快照 (restore_from_snapshot)

```bash
需要切换到该平台时:

  操作: mv snapshots/node_modules.{platform} → node_modules
  
  实际执行:
    1. mv 恢复快照到工作目录 (0.05s)
    2. 验证恢复成功
    3. 写入 node_modules/.platform = "{platform}"
  
  优点:
    - 完整恢复 (包括所有 native modules)
    - 秒级速度
    - 开箱即用 (无需额外处理)
```

### 4. 从基础恢复 (restore_from_vanilla)

```bash
准备新平台时:

  操作: cp -r vanilla → node_modules
  
  实际执行:
    1. 检查 vanilla 是否存在
    2. cp -r 复制 vanilla (100s)
    3. 不修改 vanilla (保留用于后续)
  
  用途:
    - 为 rebuild 准备基础环境
    - 包含所有 npm 包 (但无 native)
    - 供多次使用
```

### 5. 记录平台信息 (save_platform_info)

```bash
每次快照切换后:

  写入 node_modules/.platform
  
  内容:
    - "vanilla" (初始化后)
    - "linux.x86" (编译 x86 后)
    - "arm" (编译 ARM 后)
  
  目的:
    - 简单快速的状态记录
    - 避免复杂的状态同步
    - 与 node_modules 同生命周期
```

---

## 完整的编译流程

### 执行: bash pack.sh all

```
┌─────────────────────────────────────────────────┐
│ 遍历所有平台: win, linux.x86, arm              │
└─────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────┐
│ 平台 1: win                                     │
├─────────────────────────────────────────────────┤
│ 1. prepare win                                  │
│    ├─ initialize_vanilla() 如果不存在          │
│    │   └─ cp node_modules → vanilla            │
│    ├─ restore_from_vanilla() 恢复基础         │
│    │   └─ cp vanilla → node_modules            │
│    ├─ rebuild-native.js win                    │
│    │   └─ npm rebuild (构建 Windows native)   │
│    └─ save_snapshot(win)                       │
│        └─ mv node_modules → snapshots.win      │
│        └─ node_modules/.platform = "win"       │
│                                                 │
│ 2. npm run dist                                │
│    └─ 编译 Windows 版本                        │
│                                                 │
│ 3. 打包                                         │
│    └─ 生成 snippet-notes-win.tar.gz            │
└─────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────┐
│ 平台 2: linux.x86                              │
├─────────────────────────────────────────────────┤
│ 1. prepare linux.x86                           │
│    ├─ save_snapshot(win) ← 保存当前            │
│    │   └─ mv snapshots.win → snapshots/...     │
│    ├─ restore_from_vanilla()                  │
│    │   └─ cp vanilla → node_modules            │
│    ├─ rebuild-native.js linux.x86             │
│    │   └─ npm rebuild (构建 x86 native)      │
│    └─ save_snapshot(linux.x86)                │
│        └─ mv node_modules → snapshots.x86     │
│        └─ node_modules/.platform = "linux.x86"│
│                                                 │
│ 2. npm run linux.x86                           │
│    └─ 编译 Linux x86 版本                      │
│                                                 │
│ 3. 打包                                         │
│    └─ 生成 snippet-notes-linux-x86.tar.gz     │
└─────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────┐
│ 平台 3: arm                                     │
├─────────────────────────────────────────────────┤
│ 1. prepare arm                                  │
│    ├─ save_snapshot(linux.x86) ← 保存当前     │
│    │   └─ mv snapshots.x86 → snapshots/...     │
│    ├─ restore_from_vanilla()                  │
│    │   └─ cp vanilla → node_modules            │
│    ├─ rebuild-native.js arm                    │
│    │   └─ npm rebuild (构建 ARM native)       │
│    └─ save_snapshot(arm)                       │
│        └─ mv node_modules → snapshots.arm      │
│        └─ node_modules/.platform = "arm"       │
│                                                 │
│ 2. npm run arm                                  │
│    └─ 编译 ARM 版本                            │
│                                                 │
│ 3. 打包                                         │
│    └─ 生成 snippet-notes-arm.tar.gz            │
└─────────────────────────────────────────────────┘
           ↓
完成! 所有 3 个版本打包完毕
```

---

## 为什么使用 node_modules/.platform

### 优点

| 方式 | 外部状态文件 | 内部标记文件 |
|------|-----------|-----------|
| 位置 | .node_modules_snapshots/.current_snapshot | node_modules/.platform |
| 查询 | 需要检查外部目录 | 就在工作目录中 |
| 同步 | 两个地方状态可能不同步 | 一个地方，不会不同步 |
| 简洁性 | ❌ 复杂 | ✅ 简洁 |
| 可靠性 | ❌ 容易出错 | ✅ 可靠 |
| 操作复杂度 | 高 | 低 |

### 改进内容

```
之前:
  需要追踪: 
    - node_modules 的当前内容
    - .node_modules_snapshots/.current_snapshot 的值
    - 两者需要保持同步 ← 复杂！

之后:
  仅需追踪:
    - node_modules/.platform 的值
    - 与 node_modules 内容同步 ← 自动同步！
```

---

## 简洁的使用说明

```bash
# 编译所有平台
bash pack.sh all

# 手动切换平台
bash scripts/manage-node-modules.sh prepare linux.x86

# 查看当前平台
cat node_modules/.platform  # 输出: "linux.x86"

# 查看所有快照
bash scripts/manage-node-modules.sh list

# 清理旧快照
bash scripts/manage-node-modules.sh clean
```

---

## 总结

| 层级 | 内容 | 作用 |
|------|------|------|
| **工作层** | node_modules <br> node_modules/.platform | 当前构建使用<br>记录当前平台 |
| **快照层** | .node_modules_snapshots | 保存各平台备份<br>快速切换 |
| **脚本层** | manage-node-modules.sh | 自动化管理流程 |

**流程简化**: 状态信息从外部追踪 → 内部一个文件，避免复杂的同步问题。
