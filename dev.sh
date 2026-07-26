#!/bin/bash

S_DIR=$(dirname $(readlink -m $0))
PKG="$S_DIR/package.json"

function Info(){
    echo -e "\033[32m`date '+%Y-%m-%d %H:%M:%S'` Info: $1\033[0m";
}

function Error(){
    echo -e "\033[31m`date '+%Y-%m-%d %H:%M:%S'` Error: $1\033[0m";
}

function CheckOption(){
    if [ $? -ne 0 ]; then
        Error "$1";
        exit 1;
    fi
}

function _elapsed() {
    local t_start=$1
    local elapsed=$(($(date +%s) - t_start))
    Info "耗时: ${elapsed}s"
}

function show_help() {
    echo "Usage: ./dev.sh <command> [options]"
    echo ""
    echo "Commands:"
    echo "  new       小版本 +1（如 0.5.2 -> 0.5.3），末位递增"
    echo "  new major 大版本 +1（如 0.5.2 -> 0.6.0），中间位递增、末位归零"
    echo "  chg       将 change_log.txt 修改时间之后的 git 提交记录追加到最新变更"
    echo "  build     运行当前平台的构建命令"
    echo "  pack      构建并打包为 zip 或分片压缩包"
    echo "  incr      生成增量更新包（基于 dist.files.md5 对比）"
    echo "  incr label  仅生成 dist.files.md5 标签文件"
    echo "  clean     清理 dist 目录下的构建产物"
    echo "  push      将本地多个 commit squash 后推送到远程"
    echo "  help      显示此帮助信息"
}

# ===== 平台检测 =====
function _detect_platform() {
    local arch=$(uname -m)
    local os=$(uname -s)

    if [[ "$os" == CYGWIN* || "$os" == MINGW* || "$os" == MSYS* || "$os" == Windows_NT ]]; then
        if [ "$arch" == "x86_64" ]; then
            PLATFORM="win"
            BUILD_CMD="npm run dist"
            BUILD_DIR="win-unpacked"
            OUTPUT_NAME="snippet-note-win32-x64"
            LABEL_FILE="dist.files.md5.win.txt"
        else
            Error "不支持的 Windows 架构: $arch"
            exit 1
        fi
    elif [ "$os" == "Linux" ]; then
        if [ "$arch" == "x86_64" ]; then
            PLATFORM="linux.x86"
            BUILD_CMD="npm run linux.x86"
            BUILD_DIR="linux-unpacked"
            OUTPUT_NAME="snippet-note-linux-x86"
            LABEL_FILE="dist.files.md5.linux-x86.txt"
        elif [ "$arch" == "aarch64" ]; then
            PLATFORM="arm"
            BUILD_CMD="npm run arm"
            BUILD_DIR="linux-arm64-unpacked"
            OUTPUT_NAME="snippet-note-linux-arm64"
            LABEL_FILE="dist.files.md5.txt"
        else
            Error "不支持的 Linux 架构: $arch"
            exit 1
        fi
    else
        Error "不支持的操作系统: $os"
        exit 1
    fi
}

# ===== 版本号递增 =====
function incr_version() {
    local t_start=$(date +%s)
    local ver=$(grep '"version"' "$PKG" | head -1 | awk -F '"' '{print $4}')
    if [ -z "$ver" ]; then
        Error "无法读取版本号"
        exit 1
    fi

    local major=$(echo "$ver" | cut -d. -f1)
    local minor=$(echo "$ver" | cut -d. -f2)
    local patch=$(echo "$ver" | cut -d. -f3)

    if [ "$1" == "major" ]; then
        local new_minor=$((minor + 1))
        local new_ver="$major.$new_minor.0"
        Info "升级大版本（中间位）"
    else
        local new_patch=$((patch + 1))
        local new_ver="$major.$minor.$new_patch"
        Info "升级小版本（末位）"
    fi

    sed -i "s/\"version\": \"$ver\"/\"version\": \"$new_ver\"/" "$PKG"
    Info "版本号: $ver -> $new_ver"

    # 在 change_log.txt 末尾追加空行和新版本信息
    local changelog="$S_DIR/change_log.txt"
    echo "" >> "$changelog"
    echo "$new_ver" >> "$changelog"
    Info "已更新 $changelog"
    _elapsed $t_start
}

# ===== 构建 =====
function build(){
    local t_start=$(date +%s)
    _detect_platform

    Info "开始执行 $BUILD_CMD ..."
    cd "$S_DIR" && $BUILD_CMD
    CheckOption "$BUILD_CMD 执行失败"

    _elapsed $t_start
}

# ===== 打包（构建 + 压缩） =====
function pack(){
    local t_start=$(date +%s)
    _detect_platform
    local version=$(grep '"version"' "$PKG" | awk -F '"' '{print $4}')

    # 清理旧包
    rm -f "$S_DIR/dist/$OUTPUT_NAME"*.zip "$S_DIR/dist/$OUTPUT_NAME"*.z01 "$S_DIR/dist/$OUTPUT_NAME"*.z02 "$S_DIR/dist/$OUTPUT_NAME"*.z03

    # 构建
    Info "开始执行 $BUILD_CMD ..."
    cd "$S_DIR" && $BUILD_CMD
    CheckOption "$BUILD_CMD 执行失败"

    # 打包
    local src_dir="$S_DIR/dist/$BUILD_DIR"
    if [ ! -d "$src_dir" ]; then
        Error "构建产物目录 $src_dir 不存在"
        exit 1
    fi

    cd "$S_DIR/dist"

    if [ "$PLATFORM" == "arm" ]; then
        # ARM64: 分片 zip 压缩
        Info "开始将 $BUILD_DIR 打包为 $OUTPUT_NAME-$version.zip（分片）..."
        mv "$BUILD_DIR" "$OUTPUT_NAME" &&
            zip -r -s 40m "$OUTPUT_NAME-$version.zip" "$OUTPUT_NAME" &&
            mv "$OUTPUT_NAME" "$BUILD_DIR" &&
            Info "已打包为 $OUTPUT_NAME-$version.zip 及分片文件"
        CheckOption "打包 $OUTPUT_NAME 失败"

        # linux-arm64 同时生成增量包
        incr;
        CheckOption "生成增量包失败";
    else
        # Windows/Linux x86: 整体 zip
        Info "开始将 $BUILD_DIR 打包为 $OUTPUT_NAME-$version.zip ..."
        cp -rfa "$BUILD_DIR" "$OUTPUT_NAME" &&
            zip -r "$OUTPUT_NAME-$version.zip" "$OUTPUT_NAME" &&
            rm -rf "$OUTPUT_NAME" &&
            Info "已打包为 $OUTPUT_NAME-$version.zip"
        CheckOption "打包 $OUTPUT_NAME 失败"
    fi

    cd "$S_DIR"
    _elapsed $t_start
}

# ===== 增量更新 =====
function incr(){
    _detect_platform

    local t_start=$(date +%s)
    local label_flag=$1
    local version=$(grep '"version"' "$PKG" | awk -F '"' '{print $4}')

    local dist_dir="$S_DIR/dist/$BUILD_DIR"
    if [ ! -d "$dist_dir" ]; then
        Error "构建产物目录 $dist_dir 不存在，请先执行 build 或 pack"
        exit 1
    fi

    cd $S_DIR;
    # 仅生成标签文件
    if [ -n "$label_flag" ]; then
        find "./dist/$BUILD_DIR/" -type f | xargs md5sum | sort > "$LABEL_FILE"
        Info "已生成标签文件: $LABEL_FILE"
        _elapsed $t_start
        return 0
    fi

    # 增量对比
    local new_md5=$(find "./dist/$BUILD_DIR/" -type f | xargs md5sum | sort)
    if [ ! -f "$LABEL_FILE" ]; then
        Error "标签文件 $LABEL_FILE 不存在，请先用 'incr label' 生成"
        exit 1
    fi
    local old_md5=$(cat "$LABEL_FILE" | sort)

    if [ "$new_md5" == "$old_md5" ]; then
        Info "文件未变化"
        _elapsed $t_start
        return 0
    fi

    local incr_dir="./dist/incr"
    local diff_files=$(diff <(echo "$new_md5") <(echo "$old_md5") | grep "^< " | sed -r 's#.*\s\*?./dist#./dist#g')
    Info "文件有变化:\n$diff_files"

    local arch_str=$(echo "$BUILD_DIR" | sed 's/-unpacked$//')
    local incr_tar_name="snippet-notes.$version.${arch_str}.incr.tar.gz.zip"

    rm -rf "$incr_dir" && mkdir -p "$incr_dir"
    CheckOption "创建增量目录失败"

    for file in $diff_files; do
        local abs_file=$(readlink -m "$file")
        local rel_path=${abs_file#$dist_dir/}
        local rel_dir=$(dirname "$rel_path")
        mkdir -p "$incr_dir/$rel_dir"
        CheckOption "创建增量目录失败"
        cp "$abs_file" "$incr_dir/$rel_path"
        CheckOption "复制文件失败"
    done

    Info "压缩增量文件到 $incr_tar_name"
    ( cd "$incr_dir" && tar -zcvf "../$incr_tar_name" * )
    CheckOption "压缩增量包失败"

    # 更新标签文件（md5 信息暂存到 dist 下）
    echo "$new_md5" > "dist/$LABEL_FILE"
    _elapsed $t_start
}

# ===== 清理 =====
function clean(){
    _detect_platform
    Info "开始清理 $S_DIR/dist 目录"
    rm -rf "$S_DIR/dist/$BUILD_DIR" "$S_DIR/dist/incr"
    rm -rf "$S_DIR/dist/$OUTPUT_NAME"*.zip
    Info "清理完成"
}

# ===== Squash 并推送 =====
function push(){
    local t_start=$(date +%s)

    local branch=$(git rev-parse --abbrev-ref HEAD)
    Info "当前分支: $branch"

    git fetch origin "$branch"
    CheckOption "git fetch 失败"

    local ahead=$(git rev-list --count @{u}..HEAD 2>/dev/null)
    if [ $? -ne 0 ]; then
        Error "没有上游分支，请先设置 upstream"
        exit 1
    fi

    if [ "$ahead" -eq 0 ]; then
        Info "没有需要推送的提交"
        _elapsed $t_start
        return
    fi

    if [ "$ahead" -eq 1 ]; then
        Info "仅 1 个提交，直接推送..."
        git push origin "$branch"
        CheckOption "git push 失败"
        Info "推送成功"
        _elapsed $t_start
        return
    fi

    local messages=$(git log --reverse --format="- %s" @{u}..HEAD | awk '!seen[$0]++')

    echo ""
    echo "以下 $ahead 个提交将被 squash 为 1 个提交："
    echo "$messages"
    echo ""
    read -p "是否继续? (y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        Info "已取消"
        _elapsed $t_start
        return
    fi

    Info "本地领先远程 ${ahead} 个提交，开始 squash..."

    git reset --soft HEAD~$ahead
    CheckOption "git reset 失败"

    local msg=$(echo "$messages"; echo "")
    git commit -e -m "$msg"
    CheckOption "git commit 失败"

    Info "Squash 完成，开始推送..."
    git push --force-with-lease origin "$branch"
    CheckOption "git push 失败"

    Info "推送成功"
    _elapsed $t_start
}

# ===== 更新 changelog =====
function chg(){
    local t_start=$(date +%s)
    local changelog="$S_DIR/change_log.txt"
    local git_dir="$S_DIR"

    # 获取 change_log.txt 的最后修改时间（兼容 Linux/macOS）
    local mtime
    if [[ "$OSTYPE" == "darwin"* ]]; then
        mtime=$(stat -f %m "$changelog")
    else
        mtime=$(stat -c %Y "$changelog")
    fi

    # 获取该时间之后的 git 提交记录（排除 merge 提交）
    local new_entries
    new_entries=$(cd "$git_dir" && git log --since="@$mtime" --format="- %s" --no-merges --reverse 2>/dev/null)

    if [ -z "$new_entries" ]; then
        Info "没有新的 git 提交记录"
        _elapsed $t_start
        return
    fi

    Info "发现新的提交记录："
    echo "$new_entries"

    # 过滤掉已存在于 change_log.txt 中的条目，再插入到最新变更后
    local filtered=""
    while IFS= read -r entry; do
        if ! grep -qF -- "$entry" "$changelog" 2>/dev/null; then
            filtered="${filtered}${entry}"$'\n'
        fi
    done <<< "$new_entries"
    filtered=${filtered%$'\n'}

    if [ -z "$filtered" ]; then
        Info "所有条目均已存在，无需追加"
        _elapsed $t_start
        return
    fi

    Info "新增不重复的条目："
    echo "$filtered"

    # 追加到文件末尾
    echo "" >> "$changelog"
    echo "$filtered" >> "$changelog"

    local count=$(echo "$filtered" | wc -l)
    Info "已追加 ${count} 条记录到 change_log.txt"
    _elapsed $t_start
}

# ===== 主入口 =====
case "$1" in
    new)
        incr_version "$2"
        ;;
    chg)
        chg
        ;;
    build)
        build
        ;;
    pack)
        pack
        ;;
    incr)
        incr "$2"
        ;;
    clean)
        clean
        ;;
    push)
        push
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        show_help
        exit 1
        ;;
esac
