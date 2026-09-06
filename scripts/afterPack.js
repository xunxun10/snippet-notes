// electron-builder afterPack 钩子：Windows打包结束时编译md文件轻量转发程序到产物目录
// 产物 snippet-note-md.exe 嵌入md专属图标，供用户设置为md文件默认打开方式（见 scripts/launcher.cs）
// 其他平台（linux/arm64）打包时本钩子被加载但直接跳过，无平台依赖

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

function AfterPack(context){
    // 仅Windows产物需要launcher，其余平台直接跳过
    // 注意:electronPlatformName 为 Node 平台风格 ('win32'/'linux'/'darwin')，而非 'win'/'mac'
    if(context.electronPlatformName !== 'win32') return;

    const root = path.join(__dirname, '..');
    const ico = path.join(root, 'res/img/snippet-note-file.ico');
    const src = path.join(__dirname, 'launcher.cs');
    const out = path.join(context.appOutDir, 'snippet-note-md.exe');

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

module.exports = AfterPack;
module.exports.default = AfterPack;
