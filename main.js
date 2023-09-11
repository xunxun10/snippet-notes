// 程序入口

const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron')
const path = require('path')
const Notes = require('./notes')
const MyConf = require('./util/my_conf')
const MyFile = require('./util/my_file')
const {MyDate} = require('./util/my_util')
const MyLog = require('./util/my_log')

const is_mac = process.platform === 'darwin'
const is_windows = process.platform === 'win32';

// 修复窗口在弹出alert等弹框后失去焦点的bug
// let need_focus_fix = false, triggering_programmatic_blur = false;


var G_CAN_APP_EXIST = false;    // 是否可以退出

var g_conf = null
var g_sys_params = {
    local_data_dir: path.join(app.getPath('userData'), 'snippetnote.local'),
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
          label: '数据',
          submenu: [
            {
                label: '查看储存位置',
                click: () => { AlertToWeb(g_sys_params.note_db_file); },
            },
            {
                label: '修改储存位置',
                // 向前台发送消息
                click: () => ChgDbPath(),
            },
            {
                label:'保存',
                click: () => { CallWeb('save-note') }
            },
          ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Usage',
                    click: () => { AlertToWeb(MyFile.SyncRead(path.join(__dirname, 'help/help.html'))); },
                },
                {
                    label: 'About',
                    // 向前台发送消息
                    click: () => { AlertToWeb(GetAboutText()); },
                },
                {
                    label: 'License',
                    // 向前台发送消息
                    click: () => { AlertToWeb(MyFile.SyncRead(path.join(__dirname, 'LICENSE'))); },
                },
                {
                    label: 'DevTools',
                    click: () => { G_MAIN_WINDOW.webContents.openDevTools(); }
                },
            ]
        }
    ])
}

function Init(){
    MyLog.Init(path.join(g_sys_params.local_data_dir, 'logs', 'snipnote'), true);

    g_conf = new MyConf(path.join(g_sys_params.local_data_dir, g_sys_params.config_file_name));
    g_sys_params.last_note = g_conf.GetOrSet('last_note', g_sys_params.default_note)
    g_sys_params.note_db_file = g_conf.GetOrSet('note_db_file', path.join(g_sys_params.local_data_dir, g_sys_params.note_db_file_name))

    Notes.Init(g_sys_params.note_db_file)    
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
        Init();
    }
}

G_MAIN_WINDOW = null

const createWindow = () => {
    G_MAIN_WINDOW = new BrowserWindow({
      width: 1200,
      height: 800,
      icon: path.join(__dirname, 'res/img/snippet-note.ico'),
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

    // 修复窗口在弹出alert等弹框后失去焦点的bug, 有bug，在缩小后放大时会丢失操作
    /*G_MAIN_WINDOW.on('blur', (event) => {
        if(!triggering_programmatic_blur) {
            need_focus_fix = true;
        }
    })
    G_MAIN_WINDOW.on('focus', (event) => {
        if(is_windows && need_focus_fix) {
            need_focus_fix = false;
            triggering_programmatic_blur = true;
            setTimeout(function () {
                G_MAIN_WINDOW.blur();
                G_MAIN_WINDOW.focus();
                setTimeout(function () {
                    triggering_programmatic_blur = false;
                }, 100);
            }, 100);
        }
    })*/

    Init()

    // 创建菜单
    Menu.setApplicationMenu(CreateMenu())

    G_MAIN_WINDOW.loadFile('index.html')
}

// 窗口打开时
app.whenReady().then(() => {

    createWindow()
  
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
    console.log(MyDate.Now() + " send to web: " + type + ' ' + JSON.stringify(data).substring(0, 1000))
    SendToWeb('send-to-web', {type:type, data:data})
}

// ==================================================== 处理前台过来的消息 ====================================================
/**
 * 处理前端网页过来的消息
 * @param {*} event 
 * @param {*} msg 
 */
function HandleWebMsg(event, msg){
    let value = msg.data;

    console.debug(MyDate.Now() + " handle from web: " + msg.type)

    try{
        var ProcessWebCall = {
            "get-last-note":async function(v){
                if(v != null){
                    // 获取指定id的note
                    let note_id = v;
                    g_sys_params.last_note = g_conf.Set('last_note', note_id)
                    var note = await Notes.ReadNote(note_id);
                }else{
                    var note = await Notes.ReadNote(g_sys_params.last_note);
                }
                CallWeb('modify-last-note', note)
            },
            "search":async function(search_text){
                CallWeb('show_search_results', await Notes.Search(search_text))
            },
            "save_note":async function(note){
                let new_note = await Notes.Save(note)
                SendInfoToWeb("'"+ new_note.name +"'已保存")
                await UpdateLastAndIDx(note)
                SendInfoToWeb("'"+ new_note.name +"'已更新索引")
                CallWeb('modify-last-note', new_note)
            },
            "get-note-detail":async function(note_id){
                let note = await Notes.ReadNote(note_id);
                CallWeb('update-note-detail', note)
            },
            "save_and_up_note":async function({note, new_note_id}) {
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
                let note_names = await Notes.GetAllNoteNames();
                CallWeb('show-all-note-names', note_names)
            }
        }
        ProcessWebCall[msg.type](value);
    } catch (error) {
        SendErrorToWeb(error.message)
    }
}


function GetAboutText() {
    let txt = MyFile.SyncRead(path.join(__dirname, 'help/about.html'));
    let package = require("./package.json");
    return txt.replace('__version__', package.version).replace('__electron__', process.versions.electron).replace('__chromium__', process.versions.chrome).replace('__node__', process.versions.node);
}