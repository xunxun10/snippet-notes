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

function CheckOption(){
    # 检查上个命令返回值，如果不为0则打印错误信息并退出
    if [ $? -ne 0 ]; then
        Error "$1";
        exit 1;
    fi
}

version=$(grep 'version' $S_DIR/package.json | awk -F '"' '{print $4}')

# 如果是x86平台，将 win-unpacked mv 为 snippet-notes-win32-x64, 并压缩为tar.gz包，然后mv回来
if [ `uname -m` == "x86_64" ]; then
    Info "开始执行nmp dist打包命令 ...";
    npm run dist;
    CheckOption "npm run dist 执行失败";

    cd $S_DIR/dist;

    Info "开始将 win-unpacked 打包为 snippet-notes-win32-x64-$version.tar.gz ...";
    rm -rf snippet-notes-win32-x64*.tar.gz snippet-notes-win32-x64;
    cp -rfa win-unpacked snippet-notes-win32-x64 && 
        tar -zcf snippet-notes-win32-x64-$version.tar.gz snippet-notes-win32-x64 &&
        rm -rf snippet-notes-win32-x64 &&
        Info "已经成功将 win-unpacked 打包为 snippet-notes-win32-x64-$version.tar.gz";
    CheckOption "压缩程序文件失败";
elif [ `uname -m` == "aarch64" ]; then
    # 如果是arm平台，将 linux-arm64-unpacked mv 为 snippet-notes-linux-arm64, 并压缩为tar.gz包，然后mv回来
    Info "开始执行nmp arm 打包命令 ...";
    npm run arm;
    CheckOption "npm run arm 执行失败";

    cd $S_DIR/dist;

    Info "开始将 linux-arm64-unpacked 打包为 snippet-notes-linux-arm64-$version.tar.gz ...";
    rm -rf snippet-notes-linux-arm64*.tar.gz snippet-notes-linux-arm64;
    mv linux-arm64-unpacked snippet-notes-linux-arm64 && 
        tar -zcf snippet-notes-linux-arm64-$version.tar.gz snippet-notes-linux-arm64 &&
        mv snippet-notes-linux-arm64 linux-arm64-unpacked &&
        Info "已经成功将 linux-arm64-unpacked 打包为 snippet-notes-linux-arm64-$version.tar.gz";
    CheckOption "压缩程序文件失败";
else
    Error "不支持的平台";
fi
