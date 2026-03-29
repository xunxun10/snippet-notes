# Node Modules 快照管理 - 完整指南
# Node Modules Snapshot Management - Complete Guide

## 📊 系统概览

```
┌─────────────────────────────────────────────────────┐
│ 您想要: 编译多个平台                                │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│ 核心问题:                                           │
│  • 不同平台的 native modules 不兼容                │
│  • node_modules 是全局的，在编译时会被修改          │
│  • 如何快速在平台间切换?                            │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│ 解决方案: 快照管理系统                              │
│  ✓ 为每个平台保存独立的 node_modules 副本           │
│  ✓ 快速切换 (使用 mv，秒级)                         │
│  ✓ Vanilla 基础保存 npm 包 (避免重下载)             │
│  ✓ 平台信息本地化 (node_modules/.platform)         │
└─────────────────────────────────────────────────────┘
```

---

## 🔍 核心概念

### 三层结构

```
1️⃣ 工作层 (Working Layer)
   └─ node_modules/
      ├─ npm packages (express, webpack, ...)
      ├─ native modules (*.node files)
      └─ .platform ← 记录当前平台

2️⃣ 快照层 (Snapshot Layer)
   └─ .node_modules_snapshots/
      ├─ node_modules.vanilla/  (npm 包原始态)
      ├─ node_modules.linux.x86/ (x86 native)
      └─ node_modules.arm/      (arm native)

3️⃣ 脚本层 (Script Layer)
   └─ scripts/
      ├─ manage-node-modules.sh (快照管理)
      └─ rebuild-native.js      (native 构建)
```

---

## 🔄 三个关键场景

### 场景 1️⃣: 首次编译 (以 Linux x86 为例)

```
步骤 1: 初始化 Vanilla
  当前的 npm install 后的 node_modules
  → (cp, 100s, 一次性)
  → .node_modules_snapshots/node_modules.vanilla/
  
  作用: 保存 npm 包原始状态，供后续所有平台复用

步骤 2: 构建平台
  vanilla/
  → (cp, 快速恢复基础)
  → node_modules/
  → (rebuild-native.js, 40s, 仅构建 .node)
  → node_modules 现在有 x86 native
  
步骤 3: 保存平台快照
  node_modules/
  → (mv, 0.1s, 快速)
  → .node_modules_snapshots/node_modules.linux.x86/
  
步骤 4: 记录平台信息
  node_modules/.platform = "linux.x86"
  (自动随 node_modules 移动)

完成: 准备好编译 Windows/ARM，或切换到其他平台
```

### 场景 2️⃣: 新平台构建 (从 x86 切换到 ARM)

```
前置: node_modules 现在是 x86 版本, .platform = "linux.x86"

步骤 1: 保存当前平台
  node_modules (x86)
  → (mv, 0.05s)
  → .node_modules_snapshots/node_modules.linux.x86/
  
步骤 2: 恢复 Vanilla 基础
  .node_modules_snapshots/vanilla/
  → (cp, 100s, 保留原版)
  → node_modules (仅 npm 包，无 native)
  
步骤 3: 构建新平台
  node_modules
  → (rebuild-native.js arm, 90s)
  → node_modules (现在有 arm native)
  
步骤 4: 保存新平台
  node_modules
  → (mv, 0.05s)
  → .node_modules_snapshots/node_modules.arm/
  
步骤 5: 更新平台信息
  node_modules/.platform = "arm"

完成: 现在可以编译 ARM 版本
```

### 场景 3️⃣: 快速平台切换 (已有快照)

```
前置: 已有 linux.x86 和 arm 的快照

步骤 1: 保存当前 ARM
  node_modules (arm)
  → (mv, 0.05s)
  → .node_modules_snapshots/arm/
  
步骤 2: 恢复 x86 快照
  .node_modules_snapshots/linux.x86/
  → (mv, 0.05s)
  → node_modules (完整恢复所有 x86 native)
  
步骤 3: 更新平台
  node_modules/.platform = "linux.x86"

完成: 总耗时 0.1 秒！无需 rebuild

何时使用: 开发时在不同平台间切换
```

---

## 📋 完整编译流程

### 执行: `bash pack.sh all`

```bash
1. 编译 Windows
   ├─ prepare win (首次: init vanilla + rebuild + mv)
   ├─ npm run dist
   └─ 打包

2. 编译 Linux x86
   ├─ prepare linux.x86 (保存 win + rebuild x86 + mv)
   ├─ npm run linux.x86
   └─ 打包

3. 编译 ARM
   ├─ prepare arm (保存 x86 + rebuild arm + mv)
   ├─ npm run arm
   └─ 打包

结果: 所有 3 个版本都用正确的 native modules 编译
```

---

## 🎯 关键操作

### 初始化 (仅首次)

```bash
自动触发: bash prepare <platform> (首次)

执行:
  1. 检查 vanilla 是否存在
  2. 不存在 → 从当前 node_modules 复制 (一次性)
  
目的:
  - 捕获 npm install 的原始状态
  - 避免后续重新下载依赖
```

### 保存快照 (平台完成后)

```bash
执行: mv node_modules → .node_modules_snapshots/node_modules.{platform}/

好处:
  - 超快 (0.05s, 仅改变指针)
  - 原子性 (移动完整目录)
  - .platform 自动跟随
```

### 恢复快照 (需要使用时)

```bash
执行: mv .node_modules_snapshots/node_modules.{platform}/ → node_modules

好处:
  - 秒级速度
  - 完整恢复 (包括所有 native)
  - 开箱即用 (无需 rebuild)
```

### 记录平台 (每次状态变化)

```bash
执行: echo "{platform}" > node_modules/.platform

好处:
  - 自动同步 (与 node_modules 生命周期一致)
  - 避免状态不同步
  - 简洁可靠
```

---

## 💾 文件结构

```
snippet-notes/
├─ node_modules/
│  ├─ [packages]
│  ├─ [*.node files]
│  └─ .platform  ← 当前平台标识
│
├─ .node_modules_snapshots/
│  ├─ node_modules.vanilla/
│  │  └─ [vanilla npm packages, no native]
│  ├─ node_modules.linux.x86/
│  │  └─ [linux.x86 native *.node]
│  └─ node_modules.arm/
│     └─ [arm native *.node]
│
└─ scripts/
   ├─ manage-node-modules.sh
   └─ rebuild-native.js
```

---

## 🚀 常见任务

| 任务 | 命令 | 说明 |
|------|------|------|
| **编译所有** | `bash pack.sh all` | 一键完成 |
| **编译单个** | `bash pack.sh linux.x86` | 仅编译一个 |
| **切换平台** | `bash prepare <platform>` | 快速切换 (0.1s) |
| **查看快照** | `bash manage-node-modules.sh list` | 列出所有 |
| **看统计** | `bash manage-node-modules.sh stats` | 空间使用 |
| **清理** | `bash manage-node-modules.sh clean` | 删除过期 |
| **查看当前** | `cat node_modules/.platform` | 当前平台 |

---

## ⚡ 性能指标

```
首次初始化 (第一个平台):
  vanilla: 100s  (cp, 一次性)
  rebuild: 40s   (仅 native)
  保存: 0.1s     (mv)
  小计: ~150s

新平台构建:
  保存当前: 0.1s  (mv)
  恢复基础: 100s  (cp vanilla)
  rebuild: 90s    (仅 native)
  保存: 0.1s      (mv)
  小计: ~200s

已有平台切换:
  保存: 0.05s  (mv)
  恢复: 0.05s  (mv)
  小计: 0.1s   ← 超快!
```

---

## 🤔 为什么这样设计

| 设计 | 原因 |
|------|------|
| **Vanilla** | 避免重复下载 npm 包，一次 cp + 多次 rebuild |
| **平台快照** | 保存不同平台的 native modules，快速切换 |
| **mv 操作** | 秒级切换，无需复制数据，只改变指针 |
| **.platform 本地化** | 状态与 node_modules 同生命周期，自动同步 |
| **编译脚本分离** | 自动管理快照，用户仅需 bash pack.sh |

---

## ✅ 系统检查

```bash
# 检查 vanilla 是否存在
ls -lh .node_modules_snapshots/node_modules.vanilla/

# 检查平台快照
ls -lh .node_modules_snapshots/

# 检查当前平台
cat node_modules/.platform

# 查看快照大小
du -sh .node_modules_snapshots/
du -sh node_modules/

# 验证一致性
echo "当前平台: $(cat node_modules/.platform)"
echo "node_modules 实际大小: $(du -sh node_modules/ | cut -f1)"
```

---

## 📝 最佳实践

✅ **推荐**:
```bash
bash pack.sh all           # 一键编译所有
bash prepare linux.x86     # 编译前准备
cat node_modules/.platform # 检查当前平台
```

❌ **不推荐**:
```bash
rm -rf node_modules/.platform  # 勿删，自动生成
mv node_modules temp/          # 勿手动移动，用 manage-node-modules.sh
cp -r snapshots/linux.x86 node_modules  # 用 prepare，不要手动 cp
```

---

## 🎓 学到的要点

1. **三层结构**: 工作层 + 快照层 + 脚本层 = 清晰而强大
2. **mv 的力量**: 0.1s 切换 vs 200s 复制，效率提升 2000 倍
3. **vanilla 的妙用**: 一次初始化，后续复用，避免重下载
4. **状态本地化**: node_modules/.platform 避免复杂的状态同步
5. **自动化优先**: 脚本完全自动化，用户无需关心细节

---

## 🔗 相关文档

- [NODE_MODULES_PROCESS_OVERVIEW.md](NODE_MODULES_PROCESS_OVERVIEW.md) - 流程详解
- [MULTI_PLATFORM_BUILD_GUIDE.md](MULTI_PLATFORM_BUILD_GUIDE.md) - 多平台构建
- [NODE_MODULES_QUICK_REFERENCE.md](NODE_MODULES_QUICK_REFERENCE.md) - 快速参考
- [WINDOWS_BUILD_ISSUE.md](WINDOWS_BUILD_ISSUE.md) - Windows 问题

---

## 总结

| 指标 | 改进前 | 改进后 |
|------|-------|--------|
| 平台切换时间 | 200-300s | 0.1s |
| 完整编译时间 | 13+ 分钟 | 5+ 分钟 |
| 状态管理 | 复杂 (2 处) | 简洁 (1 处) |
| 代码复杂度 | 高 | 低 |
| 可靠性 | 中等 | 高 |
| 用户体验 | 需要手动干预 | 全自动 |

**最终**: 一命令启动，全自动完成，3 个平台同时支持！🚀
