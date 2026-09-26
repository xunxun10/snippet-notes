// electron-builder afterPack 钩子（各平台产物落盘后执行）：
//  * Windows：编译md文件轻量转发程序到产物目录（snippet-notes-md.exe，见 scripts/launcher.cs），
//    由用户设为md默认打开方式，任务栏因此与主程序分开。
//  * Linux（UOS/deepin等）：生成两个桌面项模板及一次性安装脚本 install-desktop.sh，
//    解压后在该目录执行一次即可把桌面项装到 ~/.local/share/applications，
//    并把md默认打开方式指向md桌面项，避免两种打开方式被任务栏误汇总。
//    模板中的 __APP_DIR__ 由安装脚本按实际解压目录回填（绿色版解压位置不固定）。

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 查找系统自带的 .NET Framework 编译器，优先64位
function FindCsc(){
    const candidates = [
        'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
        'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
    ];
    for(const p of candidates){
        if(fs.existsSync(p)) return p;
    }
    return null;
}

// Windows：编译md文件转发程序（嵌入md专属图标）
function PackWin(context){
    const root = path.join(__dirname, '..');
    const ico = path.join(root, 'res/img/snippet-notes-file.ico');
    const src = path.join(__dirname, 'launcher.cs');
    const out = path.join(context.appOutDir, 'snippet-notes-md.exe');

    if(!fs.existsSync(ico)){
        console.warn('[afterPack] 缺少 ' + ico + ' ，跳过launcher编译（请先运行 python res/img/gen_file_icon.py）');
        return;
    }
    const csc = FindCsc();
    if(!csc){
        console.warn('[afterPack] 未找到系统csc编译器，跳过launcher编译');
        return;
    }

    const res = spawnSync(csc, [
        '/nologo', '/target:winexe',
        '/r:System.Windows.Forms.dll',
        '/win32icon:' + ico,
        '/out:' + out,
        src
    ], {encoding: 'utf8'});
    if(res.status !== 0){
        // 仅警告不阻断打包
        console.warn('[afterPack] launcher编译失败: ' + (res.stderr || res.stdout || ''));
        return;
    }
    console.log('[afterPack] 已生成 ' + out);
}

// 主程序桌面项：不带md参数启动即笔记模式，对应WM_CLASS/app_id为 snippet-notes
function DesktopEntryMain(){
    return `[Desktop Entry]
Type=Application
Name=snippet-notes
Comment=效能笔记
Exec="__APP_DIR__/snippet-notes"
Icon=__APP_DIR__/resources/icon/snippet-notes.png
Terminal=false
Categories=Utility;Office;
StartupWMClass=snippet-notes
`;
}

// md桌面项：%F传入被双击的md文件，主程序据此进入md编辑模式并对外报 snippet-notes 之外的
// 应用名/桌面名（见 main.js），故与主程序在任务栏中互不汇总
function DesktopEntryMd(){
    return `[Desktop Entry]
Type=Application
Name=snippet-notes-md
Comment=效能笔记（md文档编辑）
Exec="__APP_DIR__/snippet-notes" %F
Icon=__APP_DIR__/resources/icon/snippet-notes-file.png
Terminal=false
Categories=Utility;Office;
MimeType=text/markdown;text/x-markdown;
StartupWMClass=snippet-notes-md
`;
}

// 一次性安装脚本：回填 __APP_DIR__ 后安装桌面项，并设置md默认打开方式
function InstallScript(){
    return `#!/bin/bash
# 安装桌面项（解压后在本目录执行一次即可，重复执行等于更新）：
# 1. 把 snippet-notes.desktop / snippet-notes-md.desktop 中的 __APP_DIR__ 替换为本目录绝对路径
# 2. 安装到 ~/.local/share/applications
# 3. 把 .md 文档的默认打开方式指向 snippet-notes-md.desktop

S_DIR=$(dirname "$(readlink -m "$0")")
APP="$S_DIR/snippet-notes"
DEST="$HOME/.local/share/applications"

if [ ! -x "$APP" ]; then
    echo "未找到可执行文件: $APP"
    exit 1
fi

mkdir -p "$DEST"
for name in snippet-notes snippet-notes-md; do
    sed "s|__APP_DIR__|$S_DIR|g" "$S_DIR/$name.desktop" > "$DEST/$name.desktop" || exit 1
    chmod 644 "$DEST/$name.desktop"
done

command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DEST" >/dev/null 2>&1

if command -v xdg-mime >/dev/null 2>&1; then
    xdg-mime default snippet-notes-md.desktop text/markdown
    xdg-mime default snippet-notes-md.desktop text/x-markdown
else
    echo "未找到 xdg-mime，请手工把 .md 默认打开方式设为 snippet-notes-md"
fi

echo "已安装桌面项到 $DEST"
`;
}

// Linux：生成桌面项模板与安装脚本
function PackLinux(context){
    const dir = context.appOutDir;
    fs.writeFileSync(path.join(dir, 'snippet-notes.desktop'), DesktopEntryMain());
    fs.writeFileSync(path.join(dir, 'snippet-notes-md.desktop'), DesktopEntryMd());

    const sh = path.join(dir, 'install-desktop.sh');
    fs.writeFileSync(sh, InstallScript());
    fs.chmodSync(sh, 0o755);

    console.log('[afterPack] 已生成 Linux 桌面项及 ' + sh);
}

function AfterPack(context){
    // 注意:electronPlatformName 为 Node 平台风格 ('win32'/'linux'/'darwin')，而非 'win'/'mac'
    if(context.electronPlatformName === 'win32') return PackWin(context);
    if(context.electronPlatformName === 'linux') return PackLinux(context);
}

module.exports = AfterPack;
module.exports.default = AfterPack;