#!/bin/bash

S_DIR=$(dirname $(readlink -m $0));

function Info(){
    # 打印日期和时间
    echo -e "\033[32m`date '+%Y-%m-%d %H:%M:%S'` Info: $1\033[0m";
}

function Error(){
    # 打印日期和时间
    echo -e "\033[31m`date '+%Y-%m-%d %H:%M:%S'` Error: $1\033[0m";
}

function Usage(){
    echo "使用说明:";
    echo "  bash $0 <target>";
    echo "";
    echo "支持的 target:";
    echo "  win        - 编译并打包 Windows x64 版本";
    echo "  linux.x86  - 编译并打包 Linux x86 版本";
    echo "  arm        - 编译并打包 Linux ARM64 版本";
    echo "  all        - 编译并打包所有版本 (win, linux.x86, arm)";
    echo "";
    echo "示例:";
    echo "  bash $0 win          - 仅编译 Windows 版本";
    echo "  bash $0 linux.x86    - 仅编译 Linux x86 版本";
    echo "  bash $0 arm          - 仅编译 Linux ARM64 版本";
    echo "  bash $0 all          - 编译所有版本";
}

function CheckOption(){
    # 检查上个命令返回值，如果不为0则打印错误信息并退出
    if [ $? -ne 0 ]; then
        Error "$1";
        exit 1;
    fi
}

version=$(grep 'version' $S_DIR/package.json | awk -F '"' '{print $4}')

# ===== 构建函数 =====
function BuildDist(){
    Info "开始编译 Windows 版本 ...";
    TryBuild "npm run dist" "$S_DIR/dist/win-unpacked" "Windows";
}

function BuildLinuxX86(){
    Info "开始编译 Linux x86 版本 ...";
    TryBuild "npm run linux.x86" "$S_DIR/dist/linux-unpacked" "Linux x86";
}

function BuildArm(){
    Info "开始编译 Linux ARM64 版本 ...";
    TryBuild "npm run arm" "$S_DIR/dist/linux-arm64-unpacked" "Linux ARM64";
}

# ===== 打包函数 =====
function PackDist(){
    if [ -d "$S_DIR/dist/win-unpacked" ]; then
        cd $S_DIR/dist;
        PackLinuxUnpacked "win-unpacked" "snippet-notes-win32-x64"
        Info "✓ Windows 版本打包完成";
        cd $S_DIR;
        return 0;
    else
        return 1;
    fi
}

function PackLinuxX86(){
    if [ -d "$S_DIR/dist/linux-unpacked" ]; then
        cd $S_DIR/dist;
        PackLinuxUnpacked "linux-unpacked" "snippet-notes-linux-x86"
        Info "✓ Linux x86 版本打包完成";
        cd $S_DIR;
        return 0;
    else
        return 1;
    fi
}

function PackArm(){
    if [ -d "$S_DIR/dist/linux-arm64-unpacked" ]; then
        cd $S_DIR/dist;
        PackLinuxSplit "linux-arm64-unpacked" "snippet-notes-linux-arm64"
        Info "✓ Linux ARM64 版本打包完成";
        cd $S_DIR;
        return 0;
    else
        return 1;
    fi
}

function PackLinuxUnpacked(){
    local input_dir=$1
    local output_name=$2
    
    # 检查源目录是否存在
    if [ ! -d "$input_dir" ]; then
        Error "源目录 $input_dir 不存在，跳过打包 $output_name";
        return 1;
    fi
    
    Info "开始将 $input_dir 打包为 $output_name-$version.tar.gz ...";
    cp -rfa $input_dir $output_name && 
        tar -zcf $output_name-$version.tar.gz $output_name &&
        rm -rf $output_name &&
        Info "已经成功将 $input_dir 打包为 $output_name-$version.tar.gz";
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
    
    Info "开始将 $input_dir 打包为 $output_name-$version.tar.gz ...";
    mv $input_dir $output_name && 
        tar -zcf $output_name-$version.tar.gz $output_name &&
        split -b 40m $output_name-$version.tar.gz $output_name-$version.tar.gz.part. &&
        rename 's/$/.zip/' $output_name-$version.tar.gz.part.* &&
        mv $output_name $input_dir &&
        Info "已经成功将 $input_dir 打包为 $output_name-$version.tar.gz";
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
        rm -rf $S_DIR/dist/snippet-notes-win32-x64*
        rm -rf $S_DIR/dist/snippet-notes-linux-x86*
        rm -rf $S_DIR/dist/snippet-notes-linux-arm64*
        rm -rf $S_DIR/dist/*.blockmap  $S_DIR/dist/*.exe
        
        # 编译和打包 Windows
        if BuildDist; then
            PackDist || Error "Windows 打包失败";
        else
            Info "⚠ Windows 编译失败，已跳过";
        fi
        
        # 编译和打包 Linux x86
        if BuildLinuxX86; then
            PackLinuxX86 || Error "Linux x86 打包失败";
        else
            Info "⚠ Linux x86 编译失败，已跳过";
        fi
        
        # 编译和打包 ARM
        if BuildArm; then
            PackArm || Error "Linux ARM64 打包失败";
        else
            Info "⚠ Linux ARM64 编译失败，已跳过";
        fi
        
        Info "所有版本打包完成";
        ;;
    
    win)
        Info "开始编译 Windows 版本...";
        # 清理旧编译产物
        rm -rf $S_DIR/dist/snippet-notes-win32-x64*
        rm -rf $S_DIR/dist/*.blockmap  $S_DIR/dist/*.exe
        
        if BuildDist; then
            PackDist || Error "Windows 打包失败";
        else
            Error "Windows 编译失败";
            exit 1;
        fi
        ;;
    
    linux.x86)
        Info "开始编译 Linux x86 版本...";
        # 清理旧编译产物
        rm -rf $S_DIR/dist/snippet-notes-linux-x86*
        
        if BuildLinuxX86; then
            PackLinuxX86 || Error "Linux x86 打包失败";
        else
            Error "Linux x86 编译失败";
            exit 1;
        fi
        ;;
    
    arm)
        Info "开始编译 Linux ARM64 版本...";
        # 清理旧编译产物
        rm -rf $S_DIR/dist/snippet-notes-linux-arm64*
        
        if BuildArm; then
            PackArm || Error "Linux ARM64 打包失败";
        else
            Error "Linux ARM64 编译失败";
            exit 1;
        fi
        ;;
    
    *)
        Error "未知的 target: $TARGET";
        Usage;
        exit 1;
        ;;
esac
