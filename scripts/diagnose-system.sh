#!/bin/bash

# Node Modules 快照系统诊断脚本
# Comprehensively diagnose the snapshot management system

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Node Modules 快照系统诊断 (System Diagnosis)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}\n"

# Counter
CHECKS=0
PASSED=0
FAILED=0

# Helper function to run a check
run_check() {
    local check_name="$1"
    local check_cmd="$2"
    
    CHECKS=$((CHECKS + 1))
    echo -ne "${YELLOW}[检查 $CHECKS]${NC} $check_name... "
    
    if eval "$check_cmd" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}✗${NC}"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# 1. Directory Structure
echo -e "${BLUE}📁 1. 目录结构检查${NC}\n"

run_check "node_modules 存在" "[ -d node_modules ]"
run_check "scripts 目录存在" "[ -d scripts ]"
run_check ".node_modules_snapshots 存在" "[ -d .node_modules_snapshots ]"

echo ""

# 2. Configuration Files
echo -e "${BLUE}⚙️  2. 配置文件检查${NC}\n"

run_check "package.json 存在" "[ -f package.json ]"
run_check "scripts/config.js 存在" "[ -f scripts/config.js ]"
run_check "scripts/manage-node-modules.sh 存在" "[ -f scripts/manage-node-modules.sh ]"
run_check "scripts/rebuild-native.js 存在" "[ -f scripts/rebuild-native.js ]"
run_check "pack.sh 存在" "[ -f pack.sh ]"

echo ""

# 3. Platform Information
echo -e "${BLUE}🖥️  3. 平台信息检查${NC}\n"

if [ -f node_modules/.platform ]; then
    PLATFORM=$(cat node_modules/.platform)
    echo -e "  当前平台 (Current Platform): ${GREEN}$PLATFORM${NC}"
    PASSED=$((PASSED + 1))
    CHECKS=$((CHECKS + 1))
else
    echo -e "  当前平台 (Current Platform): ${RED}未设置${NC}"
    FAILED=$((FAILED + 1))
    CHECKS=$((CHECKS + 1))
fi

echo -ne "${YELLOW}[检查 $CHECKS]${NC} 系统平台... "
SYSTEM_PLATFORM="${OSTYPE:-linux}"
echo -e "${GREEN}$SYSTEM_PLATFORM${NC}"

echo ""

# 4. Node Modules Content
echo -e "${BLUE}📦 4. Node Modules 内容检查${NC}\n"

run_check "node_modules 不为空" "[ -n \"\$(ls -A node_modules 2>/dev/null)\" ]"
run_check "node_modules/.platform 文件存在" "[ -f node_modules/.platform ]"

# Check for key npm packages
run_check "electron 已安装" "[ -d node_modules/electron ]"
run_check "sqlite3 已安装" "[ -d node_modules/sqlite3 ]"

echo ""

# 5. Snapshot Status
echo -e "${BLUE}💾 5. 快照状态检查${NC}\n"

VANILLA_EXIST="false"
SNAPSHOTS_FOUND=0

if [ -d ".node_modules_snapshots/node_modules.vanilla" ]; then
    echo -e "  ${GREEN}✓${NC} Vanilla 基础快照: 存在"
    VANILLA_EXIST="true"
    PASSED=$((PASSED + 1))
else
    echo -e "  ${RED}✗${NC} Vanilla 基础快照: 不存在"
    FAILED=$((FAILED + 1))
fi
CHECKS=$((CHECKS + 1))

# Count platform snapshots
if [ -d ".node_modules_snapshots" ]; then
    SNAPSHOTS_FOUND=$(find .node_modules_snapshots -maxdepth 1 -type d -name "node_modules.*" | wc -l)
    echo -e "  平台快照数量: ${GREEN}$SNAPSHOTS_FOUND${NC}"
    
    # List all snapshots
    echo -e "  ${BLUE}已有快照:${NC}"
    for snapshot in $(ls -1d .node_modules_snapshots/node_modules.* 2>/dev/null | sort); do
        if [ -d "$snapshot" ]; then
            SIZE=$(du -sh "$snapshot" 2>/dev/null | cut -f1)
            BASE=$(basename "$snapshot")
            echo -e "    • $BASE (${GREEN}$SIZE${NC})"
        fi
    done
fi

echo ""

# 6. Directory Sizes
echo -e "${BLUE}📊 6. 空间使用情况${NC}\n"

NODE_MODULES_SIZE=$(du -sh node_modules 2>/dev/null | cut -f1)
echo -e "  node_modules 大小: ${GREEN}$NODE_MODULES_SIZE${NC}"

SNAPSHOTS_TOTAL_SIZE=$(du -sh .node_modules_snapshots 2>/dev/null | cut -f1)
echo -e "  .node_modules_snapshots 总大小: ${GREEN}$SNAPSHOTS_TOTAL_SIZE${NC}"

TOTAL_SPACE=$(du -sh . 2>/dev/null | cut -f1)
echo -e "  项目总大小: ${GREEN}$TOTAL_SPACE${NC}"

echo ""

# 7. Script Functionality
echo -e "${BLUE}🔧 7. 脚本功能检查${NC}\n"

run_check "manage-node-modules.sh 可执行" "[ -x scripts/manage-node-modules.sh ]"
run_check "rebuild-native.js 存在" "[ -f scripts/rebuild-native.js ]"
run_check "config.js 可读" "[ -r scripts/config.js ]"

echo ""

# 8. Git Integration
echo -e "${BLUE}📚 8. Git 集成检查${NC}\n"

if [ -d ".git" ]; then
    run_check ".gitignore 配置" "grep -q 'node_modules' .gitignore"
    run_check "snapshots 被忽略" "grep -q '.node_modules_snapshots' .gitignore || grep -q 'node_modules_snapshots' .gitignore"
    run_check ".platform 被忽略" "grep -q '.platform' .gitignore"
else
    echo -e "  ${YELLOW}⚠${NC} 不在 Git 仓库中\n"
fi

echo ""

# 9. Documentation
echo -e "${BLUE}📖 9. 文档检查${NC}\n"

run_check "NODE_MODULES_QUICK_REFERENCE.md 存在" "[ -f NODE_MODULES_QUICK_REFERENCE.md ]"
run_check "NODE_MODULES_PROCESS_OVERVIEW.md 存在" "[ -f NODE_MODULES_PROCESS_OVERVIEW.md ]"
run_check "ARCHITECTURE_SIMPLIFICATION.md 存在" "[ -f ARCHITECTURE_SIMPLIFICATION.md ]"
run_check "NODE_MODULES_COMPLETE_GUIDE.md 存在" "[ -f NODE_MODULES_COMPLETE_GUIDE.md ]"

echo ""

# 10. Consistency Checks
echo -e "${BLUE}⚠️  10. 一致性检查${NC}\n"

# Check if node_modules has expected structure
EXPECTED_PACKAGES=("electron" "sqlite3" "webpack" "express")
MISSING_PACKAGES=()

for pkg in "${EXPECTED_PACKAGES[@]}"; do
    if ! [ -d "node_modules/$pkg" ]; then
        MISSING_PACKAGES+=("$pkg")
    fi
done

if [ ${#MISSING_PACKAGES[@]} -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} 所有主要包已安装"
    PASSED=$((PASSED + 1))
else
    echo -e "  ${RED}✗${NC} 缺少包: ${MISSING_PACKAGES[@]}"
    FAILED=$((FAILED + 1))
fi
CHECKS=$((CHECKS + 1))

echo ""

# Summary
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}诊断总结 (Summary)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}\n"

echo -e "  总检查数: $CHECKS"
echo -e "  ${GREEN}通过: $PASSED${NC}"
echo -e "  ${RED}失败: $FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    PERCENT=100
else
    PERCENT=$((PASSED * 100 / CHECKS))
fi

echo -e "  ${BLUE}成功率: $PERCENT%${NC}\n"

# Health Status
if [ $FAILED -eq 0 ]; then
    STATUS="${GREEN}✓ 系统健康${NC}"
    ADVICE="系统已准备好！可以随时运行 'bash pack.sh all'"
elif [ $FAILED -le 2 ]; then
    STATUS="${YELLOW}⚠ 部分问题${NC}"
    ADVICE="有几个小问题，但系统仍可工作。建议修复以确保最佳性能。"
else
    STATUS="${RED}✗ 需要修复${NC}"
    ADVICE="系统有问题，请先解决关键问题后再编译。"
fi

echo -e "  状态: $STATUS"
echo -e "  建议: $ADVICE\n"

# Recommendations
if [ $FAILED -gt 0 ]; then
    echo -e "${YELLOW}修复建议:${NC}\n"
    
    if [ ! -d ".node_modules_snapshots" ]; then
        echo "  1. 创建 .node_modules_snapshots 目录:"
        echo "     mkdir -p .node_modules_snapshots"
    fi
    
    if [ ! -f "node_modules/.platform" ]; then
        echo "  2. 初始化平台信息:"
        echo "     bash scripts/manage-node-modules.sh initialize"
    fi
    
    if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
        echo "  3. 重新安装依赖:"
        echo "     npm install"
    fi
fi

echo ""

# Quick Actions
echo -e "${BLUE}快速操作 (Quick Actions):${NC}\n"
echo "  初始化:          bash scripts/manage-node-modules.sh initialize"
echo "  查看快照:        bash scripts/manage-node-modules.sh list"
echo "  系统统计:        bash scripts/manage-node-modules.sh stats"
echo "  编译全部:        bash pack.sh all"
echo "  查看文档:        cat NODE_MODULES_COMPLETE_GUIDE.md\n"

exit 0
