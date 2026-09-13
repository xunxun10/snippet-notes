// md 文档导出（HTML / PDF / Word(.doc)）
// 思路：不依赖编辑器当前是否打开，临时新建隐藏 Crepe 渲染同一份 markdown，
// 克隆渲染后的 .milkdown DOM（与编辑器同引擎，所见即所得），清洗交互元素、
// 图片转 base64 内嵌，再组装为自包含 HTML；PDF 由主进程隐藏窗口 printToPDF，
// Word 复用 HTML 内容存为 .doc（HTML 格式，Word/WPS 可直接打开）。
(function(){
    if(typeof window.electronAPI == 'undefined') return;

    let exporting = false;              // 单飞标志，防止并发导出
    let assetsCache = null;             // 内嵌资源缓存（milkdown css + 导出 css）
    let pendingMap = {};                // 回调消息type -> Promise槽

    function makeSlot(){
        let resolveFn = null;
        let p = new Promise(res => { resolveFn = res; });
        p._resolve = resolveFn;
        return p;
    }

    // 发送请求并等待指定回调消息返回（单槽，与现有 token 关联模式同思路）
    function CallSysSlot(reqType, respType, data){
        let p = makeSlot();
        pendingMap[respType] = p;
        CallSys(reqType, data);
        return p;
    }

    // 主进程回调消息分流（第二个 OnSysCall 监听，与 renderer.js 的现有监听按 type 互不干扰）
    window.electronAPI.OnSysCall((_event, msg) => {
        let type = msg.type, value = msg.data;
        let p = pendingMap[type];
        if(p){ delete pendingMap[type]; p._resolve(value); }
    });

    // 临时隐藏容器渲染 markdown，返回挂载了 crepe 的 host 节点（含 .milkdown 子节点）
    function RenderOffscreen(md){
        return new Promise((resolve, reject) => {
            let host = document.createElement('div');
            host.style.cssText = 'position:absolute;left:-10000px;top:0;width:900px;visibility:hidden;z-index:-1;';
            document.body.appendChild(host);
            let crepe = null;
            try{
                crepe = new MilkdownCrepe({
                    root: host,
                    defaultValue: md,
                    features: {
                        [MilkdownCrepe.Feature.AI]: false,
                        // 隐藏工具栏，避免克隆到工具栏 DOM
                        [MilkdownCrepe.Feature.Toolbar]: false,
                        [MilkdownCrepe.Feature.CodeMirror]: true,
                        [MilkdownCrepe.Feature.Table]: true,
                        [MilkdownCrepe.Feature.Latex]: g_md_config.latex,
                    },
                });
            }catch(e){
                host.remove();
                reject(e);
                return;
            }
            crepe.create().then(() => {
                try{ crepe.setReadonly(true); }catch(e){}
                // 双帧兜底，确保 CodeMirror/KaTeX 布局完成
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        host._crepe = crepe;
                        resolve(host);
                    });
                });
            }).catch(e => {
                try{ crepe.destroy(); }catch(e2){}
                host.remove();
                reject(e);
            });
        });
    }

    // 移除克隆 DOM 中的交互/编辑元素，剥除编辑属性
    function CleanCloneDom(root){
        root.querySelectorAll(
            '.milkdown-toolbar, .milkdown-toolbar-wrap, .cell-handle, .line-handle, ' +
            '.table-block-menu, .table-block-menu-button, .ProseMirror-widget, ' +
            '.prosemirror-virtual-cursor, .milkdown-code-block .tools, .md-img-selected'
        ).forEach(el => el.remove());
        root.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
        root.querySelectorAll('.ProseMirror-selectednode').forEach(el => el.classList.remove('ProseMirror-selectednode'));
        // ProseMirror 根节点在克隆后可能残留编辑态标记
        root.classList.remove('ProseMirror-focused');
    }

    // 图片内嵌：data: 保留；blob: 现实化为 dataURL；file:/// 与相对路径批量走主进程转 base64
    async function ProcessImages(root){
        let pending = [];   // {img, sendSrc}
        for(let img of root.querySelectorAll('img')){
            let src = img.getAttribute('src') || '';
            if(/^data:/i.test(src)) continue;
            if(/^blob:/i.test(src)){
                try{
                    let dataUrl = await BlobUrlToDataUrl(src);
                    img.setAttribute('src', dataUrl);
                }catch(e){}
                continue;
            }
            if(/^https?:/i.test(src)) continue;   // 远程图保留原链接（与编辑器显示一致）
            let absSrc = '';
            if(/^file:/i.test(src)){
                absSrc = src;
            }else{
                let dir = GetCurMdImageDir();
                if(!dir) continue;
                absSrc = 'file:///' + dir.replace(/\\/g, '/') + '/' + String(src).replace(/^[.\/\\]+/, '');
            }
            pending.push({img: img, sendSrc: absSrc});
        }
        if(!pending.length) return;
        let token = 'md-export-' + Date.now();
        let resp = await CallSysSlot('img-read-base64', 'img-base64-result', {token: token, paths: pending.map(p => p.sendSrc)});
        let bySrc = {};
        (resp && resp.results || []).forEach(r => { if(r.dataUrl) bySrc[r.src] = r.dataUrl; });
        pending.forEach(p => {
            let d = bySrc[p.sendSrc];
            if(d) p.img.setAttribute('src', d);
        });
    }

    // 获取内嵌资源（milkdown css 字体已内嵌 + 导出专用 css），首次获取后缓存
    async function FetchAssets(){
        if(assetsCache) return assetsCache;
        let resp = await CallSysSlot('export-assets', 'export-assets-result');
        if(!resp || resp.error) throw new Error(resp && resp.error || '获取导出资源失败');
        assetsCache = resp;
        return resp;
    }

    function EscapeHtml(text){
        const map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
        return String(text).replace(/[&<>"']/g, c => map[c]);
    }

    // 组装自包含 HTML；doc 格式加 Word 兼容头
    function BuildHtml(docNode, assets, format, title){
        let css = (assets.milkdownCss || '') + '\n' + (assets.exportCss || '');
        let body = '<div class="md-export">' + docNode.outerHTML + '</div>';
        let head =
            '<meta charset="utf-8">\n' +
            '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data: http: https:; font-src data:; base-uri \'none\'; form-action \'none\'">\n' +
            '<title>' + EscapeHtml(title) + '</title>\n' +
            '<style>' + css + '</style>';
        let wordCompat = format === 'doc' ?
            '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->\n' : '';
        return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n' + head + '\n</head>\n<body>\n' + body + '\n</body>\n</html>';
    }

    function ExtOf(format){
        if(format === 'pdf') return '.pdf';
        if(format === 'doc') return '.doc';
        return '.html';
    }

    // 导出默认文件名（去 .md 后缀，清洗非法字符；空则 'export'）
    function GetExportBaseName(){
        let name = '';
        if(file_data.mode){
            let f = CurFile();
            name = f ? GetFileName(f.path) : '';
        }else{
            name = note_data.last_note && note_data.last_note.name ? String(note_data.last_note.name) : '';
        }
        name = String(name).replace(/\.md$/i, '').replace(/[\\/:*?"<>|]/g, '_').trim();
        return name || 'export';
    }

    // 导出主流程（串行单飞）
    async function Export(format){
        if(exporting){
            Info('正在导出中，请稍候');
            return;
        }
        exporting = true;
        let host = null;
        try{
            Info('正在导出...');
            let md = GetCurModifyNoteContent();
            host = await RenderOffscreen(md);
            let doc = host.querySelector('.milkdown');
            if(!doc){ throw new Error('文档渲染失败'); }
            let cloned = doc.cloneNode(true);
            CleanCloneDom(cloned);
            try{ host._crepe.destroy(); }catch(e){}
            host.remove();
            host = null;
            await ProcessImages(cloned);
            let assets = await FetchAssets();
            let baseName = GetExportBaseName();
            let html = BuildHtml(cloned, assets, format, baseName);
            // 文件模式默认存到 md 文件所在目录
            let defaultDir = (file_data.mode && CurFile()) ? GetCurMdImageDir() : '';
            let dlg = await CallSysSlot('export-dialog', 'export-dialog-result',
                {format: format, defaultName: baseName + ExtOf(format), defaultDir: defaultDir});
            if(dlg.canceled || !dlg.filePath){
                Info('已取消导出');
                return;
            }
            let save = await CallSysSlot('export-save', 'export-result',
                {format: format, filePath: dlg.filePath, html: html});
            if(save.ok){
                Info('已导出: ' + save.filePath);
            }else{
                ShowError('导出失败: ' + save.error);
            }
        }catch(e){
            ShowError('导出失败: ' + e.message);
        }finally{
            if(host){ try{ host._crepe.destroy(); }catch(e){} host.remove(); }
            exporting = false;
        }
    }

    // ===== UI：工具栏导出按钮 + 共享下拉菜单 =====
    function InitUi(){
        let menu = document.getElementById('md-export-menu');
        if(!menu) return;
        let board = document.getElementById('last-note-board');
        function PositionMenu(btn){
            if(!board) return;
            let br = btn.getBoundingClientRect();
            let bd = board.getBoundingClientRect();
            menu.style.left = (br.left - bd.left) + 'px';
            menu.style.top = (br.bottom - bd.top + 4) + 'px';
        }
        function Toggle(ev){
            ev.preventDefault();
            ev.stopPropagation();
            if(menu.style.display === 'block'){
                menu.style.display = 'none';
            }else{
                PositionMenu(ev.currentTarget);
                menu.style.display = 'block';
            }
        }
        ['md-export-btn', 'file-md-export-btn'].forEach(id => {
            let btn = document.getElementById(id);
            if(btn) btn.addEventListener('click', Toggle);
        });
        menu.addEventListener('click', function(e){
            let a = e.target && e.target.closest ? e.target.closest('a[data-format]') : null;
            if(!a) return;
            e.preventDefault();
            menu.style.display = 'none';
            Export(a.getAttribute('data-format'));
        });
        // 点击菜单/按钮之外的空白处关闭下拉
        document.addEventListener('click', function(e){
            if(menu.style.display !== 'block') return;
            if(menu.contains(e.target)) return;
            if(e.target.id === 'md-export-btn' || e.target.id === 'file-md-export-btn') return;
            menu.style.display = 'none';
        });
    }

    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', InitUi);
    }else{
        InitUi();
    }

    window.MdExport = { Export: Export };
})();
