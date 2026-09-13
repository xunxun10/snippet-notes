// 程序入口

const G_T0 = Date.now();    // 启动耗时打点基准

const { app, BrowserWindow, Menu, ipcMain, dialog, shell, session } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const Notes = require('./notes')
const MyConf = require('./util/my_conf')
const MyFile = require('./util/my_file')
const {MyDate, MyString} = require('./util/my_util')
const MyLog = require('./util/my_log')

const is_mac = process.platform === 'darwin'
const is_windows = process.platform === 'win32';

// 修复窗口在弹出alert等弹框后失去焦点的bug
// let need_focus_fix = false, triggering_programmatic_blur = false;


var G_CAN_APP_EXIST = false;    // 是否可以退出
var G_INIT_DONE = false;        // 初始化是否完成
var G_PENDING_MSGS = [];        // 初始化完成前暂存的消息
var G_DB_READY = false;         // 笔记数据库是否已初始化（文件进程延迟到需要时再初始化）

var g_conf = null

// 解析启动参数中的本地md文件路径（支持启动时直接打开文件）
function ParseStartupMdFiles(){
    let files = [];
    // argv[0]为可执行文件自身，跳过；开发模式electron . xx.md时'.'非md会被过滤
    for (let arg of process.argv.slice(1)) {
        try{
            if(!/\.md$/i.test(arg)) continue;
            let p = path.resolve(arg);
            if(MyFile.IsExist(p)) files.push(p);
        }catch(e){ /* 忽略非法参数 */ }
    }
    return files;
}

var G_STARTUP_MD_FILES = ParseStartupMdFiles();
// 带文件启动的进程只编辑文件，跳过首次自动笔记加载（避免白白读取并渲染大笔记拖慢启动），
// 关闭所有文件返回笔记模式时会再请求加载
var G_SKIP_FIRST_NOTE_LOAD = G_STARTUP_MD_FILES.length > 0;
// 带文件启动的进程还跳过笔记数据库初始化（对纯文件编辑无用，且与第一个进程存在锁竞争），
// 首次需要笔记功能时再按需初始化
var G_SKIP_DB_INIT = G_STARTUP_MD_FILES.length > 0;

// Linux：为“带md文档启动的文件进程”单独设置桌面名/窗口类（WM_CLASS），
// 使笔记窗口与md编辑窗口在窗口管理器/脚本（如 i3 规则、xdotool 匹配）中可区分。
// 笔记进程不调用此设置，沿用默认类；setDesktopName 为 Linux 专用 API，须在创建窗口前调用。
if (G_STARTUP_MD_FILES.length > 0 && process.platform === 'linux') {
    app.setDesktopName('snippet-notes-md.desktop');
}

// 共享数据目录（笔记db/配置/日志），所有进程一致；须在改写userData前取值。
// 注意：主进程新增任何需要持久化的数据都必须放在此目录下（sys.conf/notes.db/日志），
// 不要用app.getPath('userData')——文件进程的userData指向槽位档案目录，会随槽位变化
var G_SHARED_USER_DATA = app.getPath('userData');
// 文件进程的独立Chromium档案目录。两个进程共用同一userData时，Chromium的磁盘缓存
// （Cache/Code Cache/GPUCache）及LocalStorage等LevelDB的LOCK文件会互相阻塞，
// 这是第二个进程启动缓慢的主因，故文件进程使用编号槽位隔离档案目录（须在app ready前设置）。
// 槽位按1、2、3递增分配：第几个文件进程用第几个槽位；槽位目录长期保留不删除，
// 进程退出后槽位可复用，缓存随之复用使后续启动更快。
//
// ★ 本方案的使用限制（新增功能时必须遵守）：
// 1. 禁止用浏览器存储保存应用数据：localStorage/sessionStorage/IndexedDB/cookie/
//    Service Worker等均按槽位档案目录隔离，同一进程内可见，但跨进程、跨槽位完全不可见，
//    且槽位被复用后会读到上一个进程留下的残留数据。需要持久化的数据一律走共享目录
//    （G_SHARED_USER_DATA下的sys.conf/notes.db）或本地md文件，进程间内存数据不共享。
//    已核实渲染层及lib下第三方库均未使用浏览器存储，新增依赖时须保持此约定。
// 2. 渲染进程的崩溃恢复（webContents的crashed/render-process-gone后reload）不受影响，
//    仍在同一槽位内；但不要假设两个文件进程窗口共享任何Web状态。
// 3. 槽位目录会各存一份Chromium缓存/LocalStorage的LevelDB等文件，磁盘占用随槽位数
//    线性增长（本项目以本地文件为主，体积很小）；若要控制占用，可手动清理file-procs目录。
var G_FILE_PROFILE_DIR = null;
if(G_STARTUP_MD_FILES.length > 0){
    let slot = AcquireFileProfileSlot();
    G_FILE_PROFILE_DIR = path.join(G_SHARED_USER_DATA, 'file-procs', String(slot));
    app.setPath('userData', G_FILE_PROFILE_DIR);
    app.setPath('sessionData', G_FILE_PROFILE_DIR);
    console.log('[PERF] file profile slot ' + slot + ' (pid ' + process.pid + ')');
}

// 尝试占用槽位：锁不存在、或锁中pid已退出时视为可用，写入自身pid后复核（防并发竞争，后写者胜出）
function TryLockSlot(base, n){
    let lock = path.join(base, n + '.lock');
    try{
        if(fs.existsSync(lock)){
            let pid = parseInt(String(fs.readFileSync(lock, 'utf8')).trim(), 10);
            if(pid && IsPidAlive(pid)) return false;   // 该槽位正被存活进程占用
        }
        fs.writeFileSync(lock, String(process.pid));
        return String(fs.readFileSync(lock, 'utf8')).trim() === String(process.pid);
    }catch(e){
        return false;
    }
}

// 选择文件进程档案槽位：从1起复用已释放的槽位，全部占用时用最大编号+1
function AcquireFileProfileSlot(){
    let base = path.join(G_SHARED_USER_DATA, 'file-procs');
    try{ fs.mkdirSync(base, {recursive: true}); }catch(e){}
    // 统计已存在的最大槽位编号（目录或锁文件任一存在即算）
    let max_slot = 0;
    try{
        for(let name of fs.readdirSync(base)){
            let m = /^(\d+)(?:\.lock)?$/.exec(name);
            if(m) max_slot = Math.max(max_slot, parseInt(m[1], 10));
        }
    }catch(e){}
    for(let n = 1; n <= max_slot + 1; n++){
        if(TryLockSlot(base, n)) return n;
    }
    return max_slot + 2;    // 极端并发下的兜底，接受与其他进程共用
}

// 判断pid对应进程是否存活（signal 0仅检测不发送）
function IsPidAlive(pid){
    try{
        process.kill(pid, 0);
        return true;
    }catch(e){
        return e.code === 'EPERM';   // EPERM：进程存在但无权限
    }
}

var g_sys_params = {
    local_data_dir: path.join(G_SHARED_USER_DATA, 'snippetnote.local'),
    note_db_file_name: "notes.db",
    config_file_name: 'sys.conf',
    default_note : 1,

    // need calc and fill
    last_note : 0,
    note_db_file:'',
}

// 菜单详情
function CreateMenu(){
    return Menu.buildFromTemplate([
        {
          label: 'Data',
          submenu: [
            {
                label: '查看储存位置',
                click: () => { AlertToWeb(g_sys_params.note_db_file); },
            },
            {
                label:'保存当前笔记',
                click: () => { CallWeb('save-note') }
            },
            {
                label: '打开配置目录',
                click: () => { shell.openPath(g_sys_params.local_data_dir); },
            },
          ]
        },
        {
            label: 'Settings',
            submenu: [
                {
                    label: 'Markdown配置',
                    click: () => { CallWeb('md-config-open') }
                },
                {
                    label: '修改储存位置',
                    // 向前台发送消息
                    click: () => ChgDbPath(),
                },
            ]
        },
        {
            label: 'Compare',
            click: () => { CallWeb('compare-text') }
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Usage',
                    click: () => { AlertToWeb(MyFile.SyncRead(path.join(__dirname, 'help/help.html'))); },
                },
                {
                    label: 'License',
                    // 向前台发送消息
                    click: () => { AlertToWeb(MyFile.SyncRead(path.join(__dirname, 'LICENSE'))); },
                },
                {
                    label: 'About',
                    // 向前台发送消息
                    click: () => { AlertToWeb(GetAboutText()); },
                }
            ]
        },
        {
            label: 'DevTools',
            click: () => { G_MAIN_WINDOW.webContents.openDevTools(); }
        },
    ])
}

// 按需初始化笔记数据库（文件进程首次需要笔记功能时调用，幂等）
async function EnsureNotesReady(){
    if(G_DB_READY) return;
    await Notes.Init(g_sys_params.note_db_file);
    G_DB_READY = true;
    // 尝试从数据库获取默认笔记ID
    let default_note_id = await Notes.GetDefaultNoteId();
    g_sys_params.default_note = default_note_id ? default_note_id : g_sys_params.default_note;
    console.log('[PERF] db init +' + (Date.now() - G_T0) + 'ms (lazy)');
    console.log(MyDate.Now() + " found default note id: " + default_note_id);
}

// 远程(http/https)图片过滤拦截器，注册于启动时，配置变更需重启进程生效
var G_IMG_FILTER = null;

// 根据MD配置决定是否在网络层过滤远程图片请求。
// 默认(img_remote=false)过滤所有 http/https 图片，规避第三方请求/隐私跟踪/内网探测(SSRF式)。
// 开启后放行，供 MD 文档显示远程图片。CSP meta 已静态放开 http/https，故关闭态必须在此拦掉。
function SetupRemoteImageFilter(){
    let ses = session.defaultSession;
    // 移除旧拦截器，避免 Init 被重复调用时叠加
    if(G_IMG_FILTER){
        ses.webRequest.onBeforeRequest(null, G_IMG_FILTER);
        G_IMG_FILTER = null;
    }
    let cfg = g_conf.GetOrSet('md_config', {});
    if(typeof cfg == 'string'){ try{ cfg = JSON.parse(cfg); }catch(e){ cfg = {}; } }
    if(cfg.img_remote){ return; }   // 已允许远程图片，不拦截
    G_IMG_FILTER = (details, cb) => {
        if(details.resourceType === 'image' && /^https?:/i.test(details.url)){
            cb({ cancel: true });
        }else{
            cb({});
        }
    };
    ses.webRequest.onBeforeRequest(G_IMG_FILTER);
}

async function Init(){
    MyLog.Init(path.join(g_sys_params.local_data_dir, 'logs', 'snipnote'), true);

    g_conf = new MyConf(path.join(g_sys_params.local_data_dir, g_sys_params.config_file_name));
    SetupRemoteImageFilter();
    g_sys_params.last_note = g_conf.GetOrSet('last_note', g_sys_params.default_note)
    g_sys_params.note_db_file = g_conf.GetOrSet('note_db_file', path.join(g_sys_params.local_data_dir, g_sys_params.note_db_file_name))

    // 初始化数据库（文件进程跳过，返回笔记模式时由EnsureNotesReady按需初始化）
    if(!G_SKIP_DB_INIT){
        await EnsureNotesReady();
    }

    // 标记初始化完成，处理暂存的消息
    G_INIT_DONE = true;
    for (let pending of G_PENDING_MSGS) {
        HandleWebMsg(pending.event, pending.msg);
    }
    G_PENDING_MSGS = [];
}

// 修改笔记数据位置
async function ChgDbPath(){
    const { canceled, filePaths } = await dialog.showOpenDialog({'properties':['openDirectory']})
    if (!canceled) {
        let new_path = path.join(filePaths[0], g_sys_params.note_db_file_name)
        if(MyFile.IsExist(new_path)){
            SendErrorToWeb("目标路径已经存在笔记数据，将重新加载 [ " + new_path + " ] 作为新笔记，请手动将旧笔记数据 [ "+g_sys_params.note_db_file+" ] 迁移到新笔记");
        }else{
            try{
                MyFile.Copy(g_sys_params.note_db_file, new_path)
                SendInfoToWeb("笔记数据已经迁移到: " + new_path);
            }catch(e){
                SendErrorToWeb("迁移笔记异常：" + e.message);
                return;
            }
        }
        g_conf.Set('note_db_file', new_path)
        G_DB_READY = false;     // 路径已变化，强制下次重新初始化数据库连接
        await Init();
    }
}

G_MAIN_WINDOW = null

// 获取窗口图标路径：文件模式(file)与笔记模式(note)使用不同图标，windows与arm版本路径不同
function GetWindowIconPath(mode){
    let base = (mode === 'file') ? 'snippet-notes-file' : 'snippet-notes'
    if(is_windows){
        return path.join(__dirname, 'res/img/' + base + '.ico')
    }
    // linux/mac使用png图标
    return path.join(__dirname, 'res/img/' + base + '.png')
}

const createWindow = async () => {
    // 带md文件启动的进程为文件模式，使用文件模式图标（与笔记模式主图标区分）
    var icon_path = GetWindowIconPath(G_STARTUP_MD_FILES.length > 0 ? 'file' : 'note')
    G_MAIN_WINDOW = new BrowserWindow({
      width: 1200,
      height: 800,
      icon: icon_path,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false      // 禁用node.js以使用jquery,为了安全也最好不要打开
        // contextIsolation这个值，在12.0.0以前默认值为false，后面为true，区别在于为true的话，注入的preload.js可视为一个独立运行的环境，对于渲染进程是不可见的
      }
    })

    // 退出前判断前端是否有修改
    G_MAIN_WINDOW.on('close', (e) => {
        // close 也会被quit触发，所以需要通过变量判断，此变量会在quit触发的before-quit事件中置为true.也就是实现quit才是真正退出
        if (!G_CAN_APP_EXIST) {
            CallWeb("check-modify-before-close");
            e.preventDefault()
        }
    })

    // 拦截渲染进程内的外部链接导航，统一用系统默认浏览器打开，避免应用界面被跳转替换
    G_MAIN_WINDOW.webContents.on('will-navigate', (e, url) => {
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
            e.preventDefault()
            shell.openExternal(url)
        }
    })
    // target=_blank / window.open 同样改由系统浏览器打开
    G_MAIN_WINDOW.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
            shell.openExternal(url)
        }
        return { action: 'deny' }
    })

    // 先加载页面，让窗口尽快显示
    console.log('[PERF] load-file +' + (Date.now() - G_T0) + 'ms');
    G_MAIN_WINDOW.loadFile('index.html')

    // 页面加载完成后，打开启动参数中传入的本地md文件
    // 注意使用独立消息名，与对话框选择的 open-local-files 区分（后者在笔记模式下需新开进程，本消息直接进入文件模式）
    G_MAIN_WINDOW.webContents.once('did-finish-load', () => {
        console.log('[PERF] did-finish-load +' + (Date.now() - G_T0) + 'ms');
        if(G_STARTUP_MD_FILES.length > 0){
            CallWeb('startup-open-local-files', G_STARTUP_MD_FILES);
        }
    })

    // 并行初始化数据库和配置
    await Init()
    console.log('[PERF] init-done +' + (Date.now() - G_T0) + 'ms' + (G_SKIP_DB_INIT ? ' (db skipped)' : ''));

    // 创建菜单
    Menu.setApplicationMenu(CreateMenu())
}

// 窗口打开时
app.whenReady().then(() => {
    console.log('[PERF] when-ready +' + (Date.now() - G_T0) + 'ms');

    createWindow()

    // 文件进程空闲后在后台预热数据库，保证关闭所有文件返回笔记模式时无卡顿
    if(G_SKIP_DB_INIT){
        setTimeout(() => { EnsureNotesReady().catch(()=>{}); }, 5000);
    }
  
    // 兼容苹果,创建或从程序坞唤醒
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0){
            createWindow()
        }else{
            G_MAIN_WINDOW.show()
        }
    })

    // 处理未捕获异常
    process.on('uncaughtException', function (error) {
        SendErrorToWeb(error.message)
    })

    // 监听渲染器到后台事件
    ipcMain.on('send-to-bgsys', HandleWebMsg)

    // TODO:remove this, 不知为何失效
    // G_MAIN_WINDOW.webContents.openDevTools();
})


app.on('activate', () => G_MAIN_WINDOW.show()) // mac点击程序坞显示窗口
app.on('before-quit', () => {
    G_CAN_APP_EXIST = true
})
// 应用关闭时
app.on('window-all-closed', () => {
    if (!is_mac) app.quit()  // mac放入程序坞，不关闭，其他平台直接关闭
})

// 更新最新笔记信息,设置名字到配置文件并更新索引
async function UpdateLastAndIDx(note){
    g_sys_params.last_note = g_conf.Set('last_note', note.id)
    await Notes.RefreshIdx(note);
}


// ==================================================== 发送消息给前台 ====================================================
// 发送事件给前台
function SendToWeb(name, data){
    if(G_MAIN_WINDOW){
        G_MAIN_WINDOW.webContents.send(name, data)
    }
}
// 后台异常通知前台
function SendErrorToWeb(err_msg){
    console.log(MyDate.Now() + " send error msg to web: " + err_msg)
    SendToWeb('error-on-bg', err_msg)
}
// 发送普通消息给前台
function SendInfoToWeb(err_msg){
    CallWeb('info-on-bg', err_msg)
}

function AlertToWeb(msg){
    CallWeb('modal-to-web', msg)
}

// 封装后的前后台通信组件，后续只需要在对方的handle方法中实现逻辑即可，省却preload的修改
function CallWeb(type, data=null){
    // TODO:remove this
    console.log(MyDate.Now() + " send to web: " + type + ' ' + MyString.LogData(data, 1000))
    SendToWeb('send-to-web', {type:type, data:data})
}

// ==================================================== 处理前台过来的消息 ====================================================
/**
 * 处理前端网页过来的消息
 * @param {*} event 
 * @param {*} msg 
 */
function HandleWebMsg(event, msg){
    // 初始化未完成时暂存消息
    if (!G_INIT_DONE) {
        G_PENDING_MSGS.push({event, msg});
        return;
    }
    let value = msg.data;

    console.debug(MyDate.Now() + " handle from web: " + msg.type)

    try{
        var ProcessWebCall = {
            "get-last-note":async function(v){
                if(G_SKIP_FIRST_NOTE_LOAD && v == null){
                    // 带文件启动的进程：跳过首次自动笔记加载，仅在返回笔记模式时按需加载
                    G_SKIP_FIRST_NOTE_LOAD = false;
                    return;
                }
                await EnsureNotesReady();
                let note_id;
                if(v != null){
                    // 获取指定id的note
                    note_id = v;
                    g_sys_params.last_note = g_conf.Set('last_note', note_id)
                }else{
                    // 优先使用上次打开的笔记ID，如果不存在则使用默认笔记ID
                    note_id = g_sys_params.last_note || g_sys_params.default_note;
                }
                var note = await Notes.ReadNote(note_id);
                CallWeb('modify-last-note', note)
            },
            "search":async function(search_obj){
                await EnsureNotesReady();
                CallWeb('show_search_results', await Notes.Search(search_obj))
            },
            "save_note":async function(note){
                await EnsureNotesReady();
                let new_note = await Notes.Save(note)
                SendInfoToWeb("'"+ new_note.name +"'已保存")
                await UpdateLastAndIDx(note)
                SendInfoToWeb("'"+ new_note.name +"'已更新索引")
                CallWeb('modify-last-note', new_note)
            },
            "get-note-detail":async function(note_id){
                await EnsureNotesReady();
                let note = await Notes.ReadNote(note_id);
                CallWeb('update-note-detail', note)
            },
            "save_and_up_note":async function({note, new_note_id}) {
                await EnsureNotesReady();
                let new_note = await Notes.Save(note)
                SendInfoToWeb("'"+ new_note.name +"'已保存")
                await UpdateLastAndIDx(note)
                SendInfoToWeb("'"+ new_note.name +"'已更新索引")

                // 获取指定id的note
                var load_note = await Notes.ReadNote(new_note_id);
                g_sys_params.last_note = g_conf.Set('last_note', load_note.id)

                CallWeb('modify-last-note', load_note)
            },
            "close-app":function(v){
                // 收到前台检查后的退出消息，直接退出
                app.quit();
            },
            "get_all_note_names":async function(v){
                await EnsureNotesReady();
                let note_names = await Notes.GetAllNoteNames();
                CallWeb('show-all-note-names', note_names)
            },
            "get_history_notes":async function(v){
                await EnsureNotesReady();
                let notes_info = await Notes.GetNoteHistoryInfo(v);
                CallWeb('show-history-notes', notes_info)
            },
            "get-note-his-diff":async function(v){
                await EnsureNotesReady();
                let his_note = await Notes.GetNoteHistory(v);
                CallWeb('show-note-his-diff', his_note)
            },
            "set-default-note":async function(v){
                await EnsureNotesReady();
                let note_id = v.note_id;
                await Notes.SetDefaultNoteId(note_id);
                g_sys_params.default_note = note_id;
                console.log(MyDate.Now() + " set default note id: " + note_id);
            },
            "show-default-note":async function(v){
                // 返回默认笔记ID给前端
                CallWeb('show-default-note', g_sys_params.default_note);
            },
            "open-file-dialog":async function(v){
                // 弹出文件选择对话框，只支持md文件，可多选
                const { canceled, filePaths } = await dialog.showOpenDialog(G_MAIN_WINDOW, {
                    title: '打开本地md文件',
                    filters: [{ name: 'Markdown', extensions: ['md'] }],
                    properties: ['openFile', 'multiSelections']
                });
                if(!canceled && filePaths && filePaths.length > 0){
                    CallWeb('open-local-files', filePaths);
                }
            },
            "new-file-dialog":async function(v){
                // 弹出保存对话框，选择目录并命名新md文件，创建后打开
                const { canceled, filePath } = await dialog.showSaveDialog(G_MAIN_WINDOW, {
                    title: '新建md文件',
                    defaultPath: 'new.md',
                    filters: [{ name: 'Markdown', extensions: ['md'] }]
                });
                if(canceled || !filePath) return;
                try{
                    // 未带.md后缀时自动补全
                    let finalPath = filePath.toLowerCase().endsWith('.md') ? filePath : filePath + '.md';
                    if(!MyFile.IsExist(finalPath)){
                        // 不存在时创建空文件
                        MyFile.SyncSave(finalPath, '');
                        SendInfoToWeb("已创建 " + path.basename(finalPath));
                    }else{
                        // 已存在时不覆盖（避免误替换丢内容），直接打开原文件
                        SendInfoToWeb("文件已存在，直接打开: " + path.basename(finalPath));
                    }
                    CallWeb('open-local-files', [finalPath]);
                }catch(e){
                    SendErrorToWeb("创建文件失败: " + e.message);
                }
            },
            "open-files-new-process":function(paths){
                // 以文件路径为启动参数新开一个独立进程（当前为笔记模式时使用，不影响当前笔记界面）
                try{
                    // 开发模式execPath为electron.exe，需附带应用目录；打包后execPath即应用exe
                    let args = app.isPackaged ? paths.slice() : [__dirname].concat(paths);
                    let child = spawn(process.execPath, args, {detached: true, stdio: 'ignore'});
                    child.on('error', (e) => { SendErrorToWeb("新开进程失败: " + e.message); });
                    child.unref();
                    SendInfoToWeb("已在新进程中打开 " + paths.length + " 个文件");
                }catch(e){
                    SendErrorToWeb("新开进程失败: " + e.message);
                }
            },
            "set-window-title":function(v){
                // 设置窗口标题（文件模式下以文件名开头，便于区分多个进程窗口）
                if(G_MAIN_WINDOW && v){
                    G_MAIN_WINDOW.setTitle(v);
                }
            },
            "set-window-icon":function(v){
                // 设置窗口图标（文件模式/笔记模式切换时动态更换，与标题同步；v: 'file'/'note'）
                if(G_MAIN_WINDOW && v){
                    G_MAIN_WINDOW.setIcon(GetWindowIconPath(v));
                }
            },
            "read-local-file":async function(v){
                try{
                    let content = MyFile.SyncRead(v.path);
                    let mtime = fs.statSync(v.path).mtimeMs;
                    CallWeb('load-local-file', {path: v.path, content: content, mtime: mtime, reload: !!v.reload});
                }catch(e){
                    SendErrorToWeb("读取文件失败 [" + v.path + "]: " + e.message);
                }
            },
            "watch-file":function(v){
                // 监听本地文件变化，检测外部修改（磁盘一变立即回调，无需轮询）
                if(v && v.path) WatchLocalFile(v.path);
            },
            "unwatch-file":function(v){
                if(v && v.path) UnwatchLocalFile(v.path);
            },
            "save-local-file":async function(v){
                try{
                    MyFile.SyncSave(v.path, v.content);
                    let mtime = fs.statSync(v.path).mtimeMs;
                    CallWeb('local-file-saved', {path: v.path, content: v.content, mtime: mtime});
                }catch(e){
                    SendErrorToWeb("保存文件失败 [" + v.path + "]: " + e.message);
                }
            },
            "md-config-get":function(v){
                // 返回MD配置（不存在时返回空对象，由前端合并默认值）
                // ini存储为JSON字符串，读取时反序列化
                let cfg = g_conf.GetOrSet('md_config', {});
                if(typeof cfg == 'string'){
                    try{ cfg = JSON.parse(cfg); }catch(e){ cfg = {}; }
                }
                CallWeb('md-config-value', cfg);
            },
            "md-config-set":function(v){
                // 保存MD配置到 sys.conf
                g_conf.Set('md_config', v);
            },
            "save-md-image":async function(v){
                // 把拖入MD编辑器的图片保存为本地文件，回调相对路径给前端替换blob链接
                // 参数: {token, mdDir, mdName, dirRule, dataUrl}；token为blob url，用于回调关联
                try{
                    if(!v || !v.mdDir || !v.dataUrl){
                        throw new Error('保存图片参数不完整');
                    }
                    let dir = ResolveImageDir(v.mdDir, v.mdName||'', v.dirRule);
                    let ext = ExtFromDataUrl(v.dataUrl);
                    // 时间戳+序号生成文件名，避免覆盖已有图片
                    let base = 'img_' + Date.now();
                    let idx = 1;
                    let filePath = path.join(dir, base + ext);
                    while(fs.existsSync(filePath)){
                        filePath = path.join(dir, base + '_' + (idx++) + ext);
                    }
                    fs.mkdirSync(dir, {recursive:true});
                    let base64 = String(v.dataUrl).split(',')[1] || '';
                    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
                    // 相对路径以 md 文件所在目录为基准，反斜杠统一转正斜杠写入markdown
                    let relPath = path.relative(v.mdDir, filePath).split(path.sep).join('/');
                    CallWeb('md-image-saved', {token: v.token, relPath: relPath});
                }catch(e){
                    // 失败回传error，由前端自行回退base64；不用SendErrorToWeb避免全局弹错
                    CallWeb('md-image-saved', {token: v && v.token, error: e.message});
                }
            },
            "export-assets":function(v){
                // 返回导出所需的静态资源：milkdown.min.css（KaTeX字体已内嵌base64）+ 导出专用样式
                try{
                    let milkdownCss = MyFile.SyncRead(path.join(__dirname, 'lib/milkdown/milkdown.min.css'));
                    let exportCss = MyFile.SyncRead(path.join(__dirname, 'res/export-embed.css'));
                    CallWeb('export-assets-result', {
                        milkdownCss: EmbedFontsAsBase64(milkdownCss),
                        exportCss: exportCss,
                    });
                }catch(e){
                    CallWeb('export-assets-result', {error: e.message});
                }
            },
            "img-read-base64":function(v){
                // 把图片路径批量读取为base64 dataUrl，供导出HTML内嵌（失败项带error，不回退全局弹错）
                let token = v && v.token;
                let paths = (v && v.paths) || [];
                let results = paths.map(src => {
                    try{
                        let p = FileUrlToPath(src);
                        let buf = fs.readFileSync(p);
                        let mime = MimeFromExt(p);
                        return {src: src, dataUrl: 'data:' + mime + ';base64,' + buf.toString('base64')};
                    }catch(e){
                        return {src: src, error: e.message};
                    }
                });
                CallWeb('img-base64-result', {token: token, results: results});
            },
            "export-dialog":async function(v){
                // 弹出导出保存对话框
                let format = v && v.format;
                let defaultName = v && v.defaultName;
                let defaultDir = v && v.defaultDir;
                let title, filters;
                if(format === 'pdf'){
                    title = '导出为 PDF'; filters = [{name: 'PDF', extensions: ['pdf']}];
                }else if(format === 'doc'){
                    title = '导出为 Word (.doc)'; filters = [{name: 'Word 文档', extensions: ['doc']}];
                }else{
                    title = '导出为 HTML'; filters = [{name: 'HTML', extensions: ['html', 'htm']}];
                }
                let defaultPath = path.join(defaultDir || app.getPath('documents'), defaultName || 'export');
                const { canceled, filePath } = await dialog.showSaveDialog(G_MAIN_WINDOW, {
                    title: title,
                    defaultPath: defaultPath,
                    filters: filters,
                });
                CallWeb('export-dialog-result', {canceled: canceled, filePath: filePath || ''});
            },
            "export-save":async function(v){
                // 把组装好的HTML导出为指定格式文件（html/doc直接写文件，pdf走隐藏窗口printToPDF）
                let format = v && v.format;
                let filePath = v && v.filePath;
                let html = v && v.html;
                try{
                    if(!filePath || html == null){
                        throw new Error('导出参数不完整');
                    }
                    let finalPath = EnsureExportExt(filePath, format);
                    if(format === 'pdf'){
                        await ExportToPdf(finalPath, html);
                    }else{
                        MyFile.SyncSave(finalPath, html);
                    }
                    CallWeb('export-result', {ok: true, filePath: finalPath});
                }catch(e){
                    CallWeb('export-result', {ok: false, error: e.message});
                }
            },
        }
        ProcessWebCall[msg.type](value);
    } catch (error) {
        SendErrorToWeb(error.message)
    }
}

// ===== 本地文件监听（检测外部修改）=====
let g_file_watchers = {};   // path -> fs.FSWatcher

function WatchLocalFile(p){
    if(g_file_watchers[p]) return;
    try{
        g_file_watchers[p] = fs.watch(p, (eventType, filename) => {
            // 文件变化：读取当前mtime发给渲染进程，由渲染进程比较判断是否为外部修改
            // （自身保存后渲染进程会更新记录的mtime，相同mtime的事件会被忽略）
            let mtime = -1;
            try{ mtime = fs.statSync(p).mtimeMs; }catch(e){}
            CallWeb('file-external-changed', {path: p, mtime: mtime});
            // 外部工具可能用"临时文件+rename替换"保存（如vim/sed -i），会替换inode使旧watcher失效，
            // 仅在rename事件时重建监听；普通覆盖写（change）不影响watcher，无需重建
            if(eventType === 'rename'){
                UnwatchLocalFile(p);
                WatchLocalFile(p);
            }
        });
    }catch(e){
        // 监听失败（如文件不存在），忽略
    }
}

function UnwatchLocalFile(p){
    let w = g_file_watchers[p];
    if(w){
        try{ w.close(); }catch(e){}
        delete g_file_watchers[p];
    }
}

function GetAboutText() {
    let txt = MyFile.SyncRead(path.join(__dirname, 'help/about.html'));
    let package = require("./package.json");
    return txt.replace('__version__', package.version).replace('__electron__', process.versions.electron).replace('__chromium__', process.versions.chrome).replace('__node__', process.versions.node);
}

// 解析图片存放目录：默认 md 所在目录/images/<md名>；仅识别 {mdname} 占位符，
// 其余字符清洗为安全字符，解析失败或越界时统一回落默认，确保不写出 md 目录之外
function ResolveImageDir(mdDir, mdName, dirRule){
    let rule = (dirRule && typeof dirRule === 'string') ? dirRule : 'images/{mdname}';
    let safe;
    if(rule.indexOf('{mdname}') >= 0){
        safe = rule.split('{mdname}')
            .map(seg => seg.replace(/[^A-Za-z0-9_\-\s./]/g, '_').replace(/\s+/g, '_').trim())
            .join(mdName || 'note');
    }else{
        safe = rule.replace(/[^A-Za-z0-9_\-\s./]/g, '_').replace(/\s+/g, '_').trim();
    }
    // 去掉空段/前后中括路径分隔，防 .. 越界（清洗后不应含 / \ ..）
    let parts = safe.split(/[\\/]+/).filter(p => p && p !== '.' && p !== '..');
    safe = parts.join('/');
    if(!safe) safe = 'images/' + (mdName || 'note');
    let full = path.resolve(mdDir, safe);
    let rel = path.relative(path.resolve(mdDir), full);
    if(rel.startsWith('..') || path.isAbsolute(rel)){
        // 越界回落默认
        full = path.resolve(mdDir, 'images', mdName || 'note');
    }
    return path.resolve(full);
}

// 从 dataUrl 解析图片扩展名
function ExtFromDataUrl(dataUrl){
    let m = /^data:image\/([A-Za-z0-9+\-]+);/.exec(String(dataUrl||''));
    let ext = m ? m[1].toLowerCase() : '';
    if(ext === 'jpeg') ext = 'jpg';
    if(ext === 'svg+xml') ext = 'svg';
    return ext ? '.' + ext : '.png';
}

// ===== 文档导出辅助 =====
// 把 css 中 @font-face 的 url(KaTeX_*.woff2/woff/ttf) 替换为 base64 内嵌，供自包含HTML使用
function EmbedFontsAsBase64(css){
    return String(css).replace(/url\(\s*["']?(\.\/)?(KaTeX_[^"')]+)["']?\s*\)/g, (all, prefix, name)=>{
        try{
            let p = path.join(__dirname, 'lib/milkdown', name);
            let buf = fs.readFileSync(p);
            let mime = MimeFromExt(p);
            return 'url("data:' + mime + ';base64,' + buf.toString('base64') + '")';
        }catch(e){
            return all;   // 读取失败保留原引用，不阻断导出
        }
    });
}

// 文件扩展名 -> mime
function MimeFromExt(p){
    let ext = path.extname(String(p)).toLowerCase();
    if(ext === '.woff2') return 'font/woff2';
    if(ext === '.woff') return 'font/woff';
    if(ext === '.ttf') return 'font/ttf';
    if(ext === '.png') return 'image/png';
    if(ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if(ext === '.gif') return 'image/gif';
    if(ext === '.webp') return 'image/webp';
    if(ext === '.bmp') return 'image/bmp';
    if(ext === '.svg') return 'image/svg+xml';
    if(ext === '.ico') return 'image/x-icon';
    return 'application/octet-stream';
}

// file:/// URL 或裸路径 -> 本地文件路径（Windows: file:///C:/... 去掉开头的 /）
function FileUrlToPath(src){
    let s = String(src || '');
    if(s.indexOf('file://') === 0){
        s = s.slice('file://'.length);
        try{ s = decodeURIComponent(s); }catch(e){}
        if(/^\/[A-Za-z]:/.test(s)) s = s.slice(1);
    }
    return s;
}

// 导出文件名补扩展名（html/doc直接追加，pdf追加.pdf）
function EnsureExportExt(filePath, format){
    let lower = String(filePath).toLowerCase();
    if(format === 'pdf') return lower.endsWith('.pdf') ? filePath : filePath + '.pdf';
    if(format === 'doc') return lower.endsWith('.doc') ? filePath : filePath + '.doc';
    if(lower.endsWith('.html') || lower.endsWith('.htm')) return filePath;
    return filePath + '.html';
}

// 用隐藏窗口把自包含HTML打印为PDF（零依赖，Electron内置printToPDF）
async function ExportToPdf(filePath, html){
    let tmpHtml = path.join(app.getPath('temp'), 'snipnote-export-' + Date.now() + '.html');
    fs.writeFileSync(tmpHtml, html, 'utf8');
    let win = new BrowserWindow({show:false, skipTaskbar:true, webPreferences:{nodeIntegration:false}});
    try{
        await new Promise((resolve, reject)=>{
            win.webContents.once('did-finish-load', () => resolve());
            win.webContents.once('did-fail-load', (e, code, desc) => reject(new Error('页面加载失败: ' + desc)));
            win.loadFile(tmpHtml);
        });
        // 等文档字体（已内嵌base64）就绪，保证公式字形打印完整
        await win.webContents.executeJavaScript('document.fonts.ready.then(()=>true)');
        let pdfBuf = await win.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            margins: {top:0.4, bottom:0.4, left:0.4, right:0.4},
        });
        fs.writeFileSync(filePath, pdfBuf);
    }finally{
        try{ win.destroy(); }catch(e){}
        try{ fs.unlinkSync(tmpHtml); }catch(e){}
    }
}