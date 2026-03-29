#!/bin/bash

##############################################################################
# node_modules 备份和恢复管理脚本
# Manages node_modules snapshots for different build platforms
##############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SNAPSHOTS_DIR="$PROJECT_ROOT/dist/.node_modules_snapshots"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

function info() {
  echo -e "${BLUE}[node_modules]${NC} $1"
}

function success() {
  echo -e "${GREEN}[node_modules]${NC} ✓ $1"
}

function warning() {
  echo -e "${YELLOW}[node_modules]${NC} ⚠ $1"
}

function error() {
  echo -e "${RED}[node_modules]${NC} ✗ $1"
}

##############################################################################
# 核心函数
##############################################################################

# 检查当前平台 (优先从 node_modules/.platform 读取)
check_current_platform() {
  local platform_file="$PROJECT_ROOT/node_modules/.platform"
  
  if [ -f "$platform_file" ]; then
    cat "$platform_file"
  else
    echo "unknown"
  fi
}

# 记录当前平台到 node_modules/.platform
save_platform_info() {
  local platform=$1
  local platform_file="$PROJECT_ROOT/node_modules/.platform"
  
  if [ -d "$PROJECT_ROOT/node_modules" ]; then
    echo "$platform" > "$platform_file"
  else
    warning "无法保存平台信息：node_modules 不存在"
  fi
}

# 初始化 vanilla 备份 (仅一次性使用 cp)
initialize_vanilla_backup() {
  local vanilla_dir="$SNAPSHOTS_DIR/node_modules.vanilla"
  
  # 如果 vanilla 已存在，跳过
  if [ -d "$vanilla_dir" ]; then
    return 0
  fi
  
  # 如果当前没有 node_modules，无法初始化
  if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    error "当前不存在 node_modules，请先运行 npm install"
    return 1
  fi
  
  mkdir -p "$SNAPSHOTS_DIR"
  info "首次初始化：为当前 node_modules 创建 vanilla 基础备份..."
  
  # 提醒用户输入正确的平台名称以便后续使用
  read -p "请输入当前 node_modules 对应的平台名称（如 win、linux.x86、arm 等）: " cur_platform_name
  save_platform_info "$cur_platform_name"

  save_snapshot "vanilla" "copy" || return 1

  success "vanilla 基础备份完成: $size (后续操作将使用快速的 mv 替换)"
  return 0
}

# 保存当前 node_modules 到快照 (使用 mv 快速交换)
save_snapshot() {
  local target=$1
  local mode=${2:-move}  # 默认 mv，可选 copy
  local backup_dir="$SNAPSHOTS_DIR/node_modules.$target"
  
  if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    warning "当前不存在 node_modules，跳过保存"
    return 0
  fi
  
  # 移除旧备份
  [ -d "$backup_dir" ] && rm -rf "$backup_dir"
  
  if [ "$mode" = "copy" ]; then
    # 使用 cp 复制 (保留原 node_modules)
    cp -r "$PROJECT_ROOT/node_modules" "$backup_dir"
  else
    # 使用 mv 快速移动
    mv "$PROJECT_ROOT/node_modules" "$backup_dir"
  fi
  
  local size=$(du -sh "$backup_dir" | cut -f1)
  echo "$size" > "$SNAPSHOTS_DIR/node_modules.$target.size"
  
  success "已保存 $target 快照 ($size)"
}

# 恢复 node_modules 从快照 (使用 mv 快速交换)
restore_from_snapshot() {
  local target=$1
  local backup_dir="$SNAPSHOTS_DIR/node_modules.$target"
  
  if [ ! -d "$backup_dir" ]; then
    error "找不到 $target 的快照: $backup_dir"
    return 1
  fi
  
  # 使用 mv 快速移动 (不是 cp)
  mv "$backup_dir" "$PROJECT_ROOT/node_modules"
  
  local size=$(cat "$SNAPSHOTS_DIR/node_modules.$target.size" 2>/dev/null || echo "unknown")
  success "已恢复 $target 快照 ($size)"
  save_platform_info "$target"
}

# 从 vanilla 恢复 (用于初始化新平台)
restore_from_vanilla() {
  local vanilla_dir="$SNAPSHOTS_DIR/node_modules.vanilla"
  
  if [ ! -d "$vanilla_dir" ]; then
    error "vanilla 基础备份不存在"
    return 1
  fi
  
  # 如果当前已有 node_modules，先移除
  [ -d "$PROJECT_ROOT/node_modules" ] && rm -rf "$PROJECT_ROOT/node_modules"
  
  # cp -r vanilla (保留 vanilla，允许多次使用)
  cp -r "$vanilla_dir" "$PROJECT_ROOT/node_modules"
  
  success "已从 vanilla 恢复基础 node_modules"
  return 0
}

# 准备构建环境 (使用 mv 快速交换平台)
prepare_build_environment() {
  local target=$1
  
  mkdir -p "$SNAPSHOTS_DIR"
  
  # 第一步：初始化 vanilla 备份（仅一次）
  initialize_vanilla_backup || return 1
  
  # 获取当前平台信息 (从 node_modules/.platform 读取)
  local current=$(check_current_platform)
  
  # 如果已经是目标平台，无需切换
  if [ "$current" = "$target" ]; then
    info "node_modules 已经是 $target 的版本，无需切换"
    return 0
  fi
  
  # 检查是否有该平台的快照
  if [ -d "$SNAPSHOTS_DIR/node_modules.$target" ]; then
    # 目标快照存在：使用 mv 快速切换
    info "切换到已有的 $target 快照..."
    
    # 如果当前有 node_modules，先保存当前平台
    if [ -d "$PROJECT_ROOT/node_modules" ] && [ "$current" != "unknown" ]; then
      info "保存当前的 $current 快照后切换"
      save_snapshot "$current" || return 1
    fi
    
    # 快速恢复目标快照
    restore_from_snapshot "$target" || return 1
  else
    # 目标快照不存在：需要首次构建该平台
    info "首次为 $target 构建，使用 vanilla 基础 + rebuild..."
    
    # 保存当前使用中的平台
    if [ -d "$PROJECT_ROOT/node_modules" ] && [ "$current" != "unknown" ]; then
      save_snapshot "$current" || return 1
    fi
    
    # 从 vanilla 恢复基础环境
    restore_from_vanilla || return 1
    
    # 执行平台特定的 rebuild
    info "为 $target 重建 native modules..."
    node "$SCRIPT_DIR/rebuild-native.js" "$target" || true
    
    # 保存重建后的结果为新快照 (使用 copy 保留 node_modules)
    save_platform_info "$target"
  fi
}

# 列出所有快照
list_snapshots() {
  info "已有的 node_modules 快照："
  
  if [ ! -d "$SNAPSHOTS_DIR" ]; then
    echo "  (无快照)"
    return 0
  fi
  
  local current=$(check_current_platform)
  local found=0
  
  # 检查 vanilla
  if [ -d "$SNAPSHOTS_DIR/node_modules.vanilla" ]; then
    local size=$(cat "$SNAPSHOTS_DIR/node_modules.vanilla.size" 2>/dev/null || echo "?")
    echo "  🔧 vanilla ($size) [基础备份]"
    found=1
  fi
  
  # 列出平台快照
  for snapshot in "$SNAPSHOTS_DIR"/node_modules.*; do
    if [ -d "$snapshot" ]; then
      local name=$(basename "$snapshot" | sed 's/^node_modules\.//')
      
      # 跳过已处理的 vanilla
      [ "$name" = "vanilla" ] && continue
      
      local size_file="$SNAPSHOTS_DIR/node_modules.$name.size"
      local size=$(cat "$size_file" 2>/dev/null || echo "?")
      
      if [ "$name" = "$current" ]; then
        echo "  * $name ($size) [当前]"
      else
        echo "  - $name ($size)"
      fi
      found=1
    fi
  done
  
  if [ $found -eq 0 ]; then
    echo "  (仅有 vanilla 基础备份)"
  fi
}

# 清理过期快照 (保留 vanilla 和当前快照)
clean_old_snapshots() {
  info "清理过期的 node_modules 快照..."
  
  if [ ! -d "$SNAPSHOTS_DIR" ]; then
    info "无快照需要清理"
    return 0
  fi
  
  local current=$(check_current_platform)
  local deleted=0
  
  for snapshot in "$SNAPSHOTS_DIR"/node_modules.*; do
    if [ -d "$snapshot" ]; then
      local name=$(basename "$snapshot" | sed 's/^node_modules\.//')
      
      # 保留 vanilla 和当前使用的快照
      if [ "$name" = "vanilla" ]; then
        continue
      fi
      
      if [ "$name" = "$current" ]; then
        continue
      fi
      
      warning "删除过期快照: $name"
      rm -rf "$snapshot"
      rm -f "$SNAPSHOTS_DIR/node_modules.$name.size"
      deleted=$((deleted + 1))
    fi
  done
  
  if [ $deleted -eq 0 ]; then
    success "无过期快照需要删除"
  else
    success "已删除 $deleted 个过期快照"
  fi
}

# 显示统计信息
show_stats() {
  info "node_modules 统计信息："
  
  local current=$(check_current_platform)
  echo "  当前快照: $current"
  
  if [ -d "$PROJECT_ROOT/node_modules" ]; then
    local size=$(du -sh "$PROJECT_ROOT/node_modules" | cut -f1 2>/dev/null || echo "?")
    echo "  当前大小: $size"
  fi
  
  if [ -d "$SNAPSHOTS_DIR" ]; then
    local total_size=$(du -sh "$SNAPSHOTS_DIR" | cut -f1 2>/dev/null || echo "?")
    echo "  快照总大小: $total_size"
    
    local vanilla_size="?"
    if [ -f "$SNAPSHOTS_DIR/node_modules.vanilla.size" ]; then
      vanilla_size=$(cat "$SNAPSHOTS_DIR/node_modules.vanilla.size")
    fi
    echo "  - vanilla 基础: $vanilla_size"
    
    local platform_count=$(ls -1d "$SNAPSHOTS_DIR"/node_modules.* 2>/dev/null | grep -v vanilla | wc -l)
    echo "  - 平台快照个数: $platform_count"
    echo ""
    echo "  性能提示:"
    echo "    • 首次初始化: 复制一份 vanilla 基础备份"
    echo "    • 后续平台切换: 使用 mv 快速交换 (秒级速度)"
    echo "    • 首次编译新平台: vanilla + rebuild + mv 快速保存"
  fi
}

##############################################################################
# 命令行接口
##############################################################################

case "${1:-help}" in
  prepare)
    if [ -z "$2" ]; then
      error "请指定目标平台"
      echo "用法: $0 prepare <platform>"
      echo "可用平台: win, linux.x86, arm"
      exit 1
    fi
    prepare_build_environment "$2"
    ;;
  
  backup)
    if [ -z "$2" ]; then
      error "请指定快照名称"
      echo "用法: $0 backup <name>"
      exit 1
    fi
    save_snapshot "$2"
    ;;
  
  restore)
    if [ -z "$2" ]; then
      error "请指定要恢复的快照"
      echo "用法: $0 restore <platform>"
      exit 1
    fi
    
    local current=$(check_current_platform)
    if [ "$current" != "unknown" ] && [ "$current" != "$2" ]; then
      save_snapshot "$current" || exit 1
    fi
    
    restore_from_snapshot "$2"
    ;;
  
  list)
    list_snapshots
    ;;
  
  clean)
    clean_old_snapshots
    ;;
  
  stats)
    show_stats
    ;;
  
  help|--help|-h)
    cat <<EOF
usage: $0 <command> [options]

Commands:
  prepare <platform>    准备构建环境（智能快照管理和快速 mv 切换）
  backup <name>         为当前 node_modules 创建自定义快照
  restore <platform>    恢复指定平台的快照
  list                  列出所有快照（包括 vanilla 基础）
  clean                 删除过期的快照（保留 vanilla 和当前）
  stats                 显示快照使用统计和性能信息
  help                  显示此帮助

工作原理：
  首次使用 - 创建 vanilla 基础备份：
    • 自动从当前 node_modules 复制一份 vanilla 基础备份
    • 后续所有操作都基于这个基础备份
    • 一次性 copy 操作，避免重新下载依赖

  平台切换 - 快速 mv 交换：
    • 保存当前平台的 node_modules → 快照目录 (使用 mv，秒级)
    • 恢复目标平台的 node_modules ← 快照目录 (使用 mv，秒级)
    • 首次编译新平台：vanilla + rebuild + mv 快速保存

  清理 - 保留基础和当前：
    • clean 命令删除过期快照，保留 vanilla 和当前使用的快照
    • 可手动删除特定快照释放空间

Examples:
  $0 prepare win        # 为 Windows 准备环境（首次：rebuild + mv，后续：快速恢复）
  $0 prepare arm        # 为 ARM 准备环境（自动保存前一平台，恢复目标）
  $0 list               # 列出所有快照（显示 vanilla 和各平台）
  $0 stats              # 显示使用统计和性能信息
  $0 restore linux.x86  # 恢复 Linux x86 环境进行开发或测试
  $0 clean              # 清理过期快照（保留 vanilla 和当前）

性能特性：
  ✓ 首次初始化：完整 copy vanilla (避免重新 npm install)
  ✓ 平台切换：使用 mv 快速交换 (500MB 在秒级完成)
  ✓ 编译新平台：vanilla + rebuild + mv 保存
  ✓ 智能恢复：如果快照不存在会自动创建，不会丢失已有的 node_modules

EOF
    ;;
  
  *)
    error "未知命令: $1"
    echo "使用 '$0 help' 获取帮助"
    exit 1
    ;;
esac
