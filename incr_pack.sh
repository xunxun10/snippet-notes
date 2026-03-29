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

label_flag=$1

version=$(grep 'version' $S_DIR/package.json | awk -F '"' '{print $4}')

label_file="dist.files.md5.txt"
if [ `uname -m` == "x86_64" ]; then
    dist_dir="dist/win-unpacked"
elif [ `uname -m` == "aarch64" ]; then
    dist_dir="dist/linux-arm64-unpacked"
else
    Error "不支持的平台";
    exit 1;
fi

if [ -n "$label_flag" ]; then
     find ./$dist_dir/ -type f | xargs md5sum | sort > "$label_file"
     Info "已生成标签文件: $label_file";
     exit 0
fi

new_md5=$(find ./$dist_dir/ -type f | xargs md5sum | sort)
old_md5=$(cat "$label_file" | sort)

if [ "$new_md5" == "$old_md5" ]; then
    Info "文件未变化"
    exit 0
fi

incr_dir="./dist/incr"
diff_files=$(diff <(echo "$new_md5") <(echo "$old_md5") | grep "^< " | sed -r 's#.*\s\*?./dist#./dist#g')
Info "文件有变化:\n$diff_files"

rm -rf "$incr_dir" && mkdir -p "$incr_dir"
CheckOption "创建增量目录失败"

for file in $diff_files; do
    Info "处理文件$incr_dir: $file"
    rel_path=${file#./$dist_dir/}
    rel_dir=${rel_path%/*}
    Info "拷贝文件到$incr_dir/$rel_path"
    mkdir -p "$incr_dir/$rel_dir"
    CheckOption "创建增量目录失败"
    cp "$file" "$incr_dir/$rel_path"
    CheckOption "复制文件失败"
done

Info "压缩增加文件到 $dist_dir.tar.gz"
# 名字类似 snippet-notes.$version.linux-arm64.incr.tar.gz.zip
arch_str=$(basename "$dist_dir" | sed 's/-unpacked$//')
incr_tar_name="snippet-notes.$version.${arch_str}.incr.tar.gz.zip"
( cd $incr_dir && tar -zcvf  "../$incr_tar_name"  * );
CheckOption "压缩$incr_tar_name失败"

# md5信息暂存在dist目录下，如果需要使用此版本为基准，则需要将此文件拷贝回项目根目录
echo "$new_md5" > "dist/$label_file"