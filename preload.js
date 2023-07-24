// 在窗口及dom之间传递数据
const { contextBridge, ipcRenderer } = require('electron')

// 文档加载后执行
window.addEventListener('DOMContentLoaded', () => {
    
})


// 设置后台与前台事件
contextBridge.exposeInMainWorld('electronAPI', {
    // 前台调后台接口，send为单向，invoke为双向
    CallSys:(msg) => ipcRenderer.send('send-to-bgsys', msg),

    // 后台调前台接口
    OnBgErrorMsg: (callback) => ipcRenderer.on('error-on-bg', callback),
    OnSysCall: (callback) => ipcRenderer.on('send-to-web', callback),
})