#!/bin/bash

S_DIR=$(dirname $(readlink -m $0));

# ===== 颜色和格式函数 =====
function Info(){
    # 打印日期和时间
    echo -e "\033[32m`date '+%Y-%m-%d %H:%M:%S'` Info: $1\033[0m";
}

function Error(){
    # 打印日期和时间
    echo -e "\033[31m`date '+%Y-%m-%d %H:%M:%S'` Error: $1\033[0m";
}

# ===== 从 package.json 读取配置 =====
PROJECT_NAME=$(grep '"name"' $S_DIR/package.json | head -1 | awk -F '"' '{print $4}')
PROJECT_VERSION=$(grep '"version"' $S_DIR/package.json | awk -F '"' '{print $4}')

# ===== 平台配置（从这里定义所有平台信息） =====
declare -A PLATFORMS
declare -A BUILD_CMDS
declare -A OUTPUT_NAMES
declare -A BUILD_DIRS
declare -A PACK_FUNCS

# Windows x64
PLATFORMS[win]="win32-x64"
BUILD_CMDS[win]="npm run dist"
OUTPUT_NAMES[win]="$PROJECT_NAME-win32-x64"
BUILD_DIRS[win]="win-unpacked"
PACK_FUNCS[win]="PackLinuxUnpacked"

# Linux x86
PLATFORMS[linux.x86]="linux-x86"
BUILD_CMDS[linux.x86]="npm run linux.x86"
OUTPUT_NAMES[linux.x86]="$PROJECT_NAME-linux-x86"
BUILD_DIRS[linux.x86]="linux-unpacked"
PACK_FUNCS[linux.x86]="PackLinuxUnpacked"

# Linux ARM64
PLATFORMS[arm]="linux-arm64"
BUILD_CMDS[arm]="npm run arm"
OUTPUT_NAMES[arm]="$PROJECT_NAME-linux-arm64"
BUILD_DIRS[arm]="linux-arm64-unpacked"
PACK_FUNCS[arm]="PackLinuxSplit"

# ===== 平台描述 =====
declare -A PLATFORM_DESC
PLATFORM_DESC[win]="Windows x64"
PLATFORM_DESC[linux.x86]="Linux x86"
PLATFORM_DESC[arm]="Linux ARM64"

function Usage(){
    echo "使用说明:";
    echo "  bash $0 <target>";
    echo "";
    echo "支持的 target:";
    for target in win linux.x86 arm all; do
        if [ "$target" == "all" ]; then
            echo "  all        - 编译并打包所有版本";
        else
            echo "  $target        - 编译并打包 ${PLATFORM_DESC[$target]} 版本";
        fi
    done
    echo "";
    echo "示例:";
    echo "  bash $0 win          - 仅编译 Windows 版本";
    echo "  bash $0 linux.x86    - 仅编译 Linux x86 版本";
    echo "  bash $0 arm          - 仅编译 Linux ARM64 版本";
    echo "  bash $0 all          - 编译所有版本";
    echo "";
    echo "项目信息:";
    echo "  名称: $PROJECT_NAME";
    echo "  版本: $PROJECT_VERSION";
}

function CheckOption(){
    # 检查上个命令返回值，如果不为0则打印错误信息并退出
    if [ $? -ne 0 ]; then
        Error "$1";
        exit 1;
    fi
}

# ===== 通用构建函数 =====
function Build(){
    local target=$1
    local desc=${PLATFORM_DESC[$target]}
    local build_cmd=${BUILD_CMDS[$target]}
    
    Info "开始编译 $desc 版本 ...";
    
    # 准备 node_modules 环境（备份/恢复到指定平台）
    Info "为 $desc 准备 node_modules 环境...";
    bash "$S_DIR/scripts/manage-node-modules.sh" prepare "$target" || {
        Error "准备 node_modules 失败";
        return 1;
    }
    
    # 确保 devDependencies 已安装
    Info "安装 devDependencies...";
    npm install || {
        Error "安装依赖失败";
        return 1;
    }
    
    TryBuild "$build_cmd" "$S_DIR/dist/${BUILD_DIRS[$target]}" "$desc";
}

# ===== 通用打包函数 =====
function Pack(){
    local target=$1
    local desc=${PLATFORM_DESC[$target]}
    local pack_func=${PACK_FUNCS[$target]}
    local output_name=${OUTPUT_NAMES[$target]}
    local build_dir=${BUILD_DIRS[$target]}
    
    if [ -d "$S_DIR/dist/$build_dir" ]; then
        cd $S_DIR/dist;
        $pack_func "$build_dir" "$output_name"
        Info "✓ $desc 版本打包完成";
        cd $S_DIR;
        return 0;
    else
        return 1;
    fi
}

# ===== 旧的特定函数（为了兼容性保留） =====
function BuildDist(){
    Build "win" "x64";
}

function BuildLinuxX86(){
    Build "linux.x86" "x64";
}

function BuildArm(){
    Build "arm" "arm64";
}

function PackLinuxUnpacked(){
    local input_dir=$1
    local output_name=$2
    
    # 检查源目录是否存在
    if [ ! -d "$input_dir" ]; then
        Error "源目录 $input_dir 不存在，跳过打包 $output_name";
        return 1;
    fi
    
    Info "开始将 $input_dir 打包为 $output_name-$PROJECT_VERSION.tar.gz ...";
    cp -rfa $input_dir $output_name && 
        tar -zcf $output_name-$PROJECT_VERSION.tar.gz $output_name &&
        rm -rf $output_name &&
        Info "已经成功将 $input_dir 打包为 $output_name-$PROJECT_VERSION.tar.gz";
    CheckOption "压缩$output_name文件失败";
}

function PackLinuxSplit(){
    local input_dir=$1
    local output_name=$2
    
    # 检查源目录是否存在
    if [ ! -d "$input_dir" ]; then
        Error "源目录 $input_dir 不存在，跳过打包 $output_name";
        return 1;
    fi
    
    Info "开始将 $input_dir 打包为 $output_name-$PROJECT_VERSION.tar.gz ...";
    mv $input_dir $output_name && 
        tar -zcf $output_name-$PROJECT_VERSION.tar.gz $output_name &&
        split -b 40m $output_name-$PROJECT_VERSION.tar.gz $output_name-$PROJECT_VERSION.tar.gz.part. &&
        (for f in $output_name-$PROJECT_VERSION.tar.gz.part.*; do mv "$f" "$f.zip"; done) &&
        mv $output_name $input_dir &&
        Info "已经成功将 $input_dir 打包为 $output_name-$PROJECT_VERSION.tar.gz";
    CheckOption "压缩$output_name文件失败";
}

function TryBuild(){
    local build_cmd=$1
    local expected_dir=$2
    local build_name=$3
    
    Info "尝试执行 $build_cmd 命令 ...";
    eval $build_cmd;
    
    if [ $? -ne 0 ]; then
        Error "$build_name 编译失败";
        return 1;
    fi
    
    # 检查编译产物是否存在
    if [ ! -d "$expected_dir" ]; then
        Error "编译产物目录 $expected_dir 不存在，跳过";
        return 1;
    fi
    
    return 0;
}

# 检查是否提供了 target 参数
if [ -z "$1" ]; then
    Error "缺少必要参数: target";
    Usage;
    exit 1;
fi

TARGET=$1

case $TARGET in
    all)
        Info "开始执行所有编译操作...";
        # 清理旧编译产物
        for target in win linux.x86 arm; do
            output_pattern="${OUTPUT_NAMES[$target]}-$PROJECT_VERSION*"
            rm -rf $S_DIR/dist/$output_pattern
        done
        rm -rf $S_DIR/dist/*.blockmap $S_DIR/dist/*.exe
        
        # 编译和打包所有版本
        for target in win linux.x86 arm; do
            rebuild_arch=""
            [ "$target" == "win" ] && rebuild_arch="x64"
            [ "$target" == "linux.x86" ] && rebuild_arch="x64"
            [ "$target" == "arm" ] && rebuild_arch="arm64"
            
            if Build "$target" "$rebuild_arch"; then
                if Pack "$target"; then
                    : # Success
                else
                    Error "${PLATFORM_DESC[$target]} 打包失败";
                fi
            else
                Info "⚠ ${PLATFORM_DESC[$target]} 编译失败，已跳过";
            fi
        done
        
        Info "所有版本打包完成";
        ;;
    
    win|linux.x86|arm)
        desc=${PLATFORM_DESC[$TARGET]}
        Info "开始编译 $desc 版本...";
        
        # 清理旧编译产物
        output_pattern="${OUTPUT_NAMES[$TARGET]}-$PROJECT_VERSION*"
        rm -rf $S_DIR/dist/$output_pattern
        
        # 清理 exe 和 blockmap 文件（Windows）
        if [ "$TARGET" == "win" ]; then
            rm -rf $S_DIR/dist/*.blockmap $S_DIR/dist/*.exe
        fi
        
        # 确定 rebuild arch
        rebuild_arch=""
        [ "$TARGET" == "win" ] && rebuild_arch="x64"
        [ "$TARGET" == "linux.x86" ] && rebuild_arch="x64"
        [ "$TARGET" == "arm" ] && rebuild_arch="arm64"
        
        if Build "$TARGET" "$rebuild_arch"; then
            if Pack "$TARGET"; then
                Info "✓ $desc 版本编译和打包完成";
            else
                Error "$desc 打包失败";
                exit 1;
            fi
        else
            Error "$desc 编译失败";
            exit 1;
        fi
        ;;
    
    *)
        Error "未知的 target: $TARGET";
        Usage;
        exit 1;
        ;;
esac
