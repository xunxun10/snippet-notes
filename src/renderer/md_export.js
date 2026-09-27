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

    // Word(.doc) 专用字体栈：Word 不支持 var()，milkdown 的字体声明会被整条丢弃。
    const WORD_FONT = '"Noto Sans", Arial, "Microsoft YaHei", Helvetica, sans-serif';
    const WORD_TITLE_FONT = '"Noto Serif", Cambria, "Times New Roman", Times, serif';
    // 仅 doc 格式追加的 Word 兼容样式（字面值，避免丢失 var() 后回退到 Word 默认字体）
    const WORD_COMPAT_CSS =
        '.md-export .milkdown{font-family:' + WORD_FONT + ';}\n' +
        '.md-export .milkdown .ProseMirror h1,.md-export .milkdown .ProseMirror h2,' +
        '.md-export .milkdown .ProseMirror h3,.md-export .milkdown .ProseMirror h4,' +
        '.md-export .milkdown .ProseMirror h5,.md-export .milkdown .ProseMirror h6' +
        '{font-family:' + WORD_TITLE_FONT + ';}\n';

    // 用子节点替换自身（保留内容、去掉包装层）
    function Unwrap(el){
        while(el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
        el.parentNode.removeChild(el);
    }

    // Word(.doc) 兼容处理。
    // 1) Word 打开 HTML 表格时按 HTML 默认值给表格开启“允许单元格间距”，相邻单元格各自
    //    画一条边框，看起来就是双虚线；浏览器有 border-collapse:collapse 兜底所以正常。
    //    这里显式写 cellspacing="0" 并内联 border-collapse，让 Word 合并为单实线。
    // 2) milkdown 的删除线渲染为 <del>，Word 把它当作 HTML 语义的“已删除内容”，显示成
    //    修订删除标记而不是普通删除线；换成行内 text-decoration 只保留视觉删除线。
    // 3) Word 给 <a> 套内置“Hyperlink”字符样式，该样式的字体/字号不跟随正文（Word 长期
    //    已知行为），链接会用另一套字体显得突兀；把字体栈内联到 <a> 上直接覆盖。
    // 4) 列表项是编辑器专用结构（li.list-item > div.label-wrapper + div.children），Word
    //    会把 li 内的块级 div 逐个拆成独立段落：li 自身段落为空（空列表项）、序号标签单独
    //    成行、内容段落被推下去（里面的链接看起来“换行”）。这里去掉序号标签、展开包装层，
    //    还原成标准 <li>…</li>，由 Word 自己生成项目符号/编号。
    function ApplyWordCompat(root){
        // Word 表格：无固定宽度时 Word 按内容自动排版，列会被长 URL 等撑到超出页宽。
        // 这里设 width:100% + fixed 布局收进页面，长内容换行，并移除编辑器用于横向滚动的
        // 空辅助表(.drag-preview)，避免 Word 里出现多余的空表格块。
        root.querySelectorAll('.milkdown-table-block table').forEach(t => {
            if(!(t.querySelector('th') || t.querySelector('td'))){
                t.remove();
                return;
            }
            t.setAttribute('cellspacing', '0');
            t.setAttribute('cellpadding', '0');
            t.setAttribute('width', '100%');
            let style = t.getAttribute('style') || '';
            t.setAttribute('style', style + ';border-collapse:collapse;border-spacing:0;width:100%;table-layout:fixed;');
        });
        root.querySelectorAll('.milkdown-table-block th, .milkdown-table-block td').forEach(c => {
            let s = c.getAttribute('style') || '';
            c.setAttribute('style', s + ';word-break:break-all;');
        });
        // 代码块字体：Word 对 <code>/<pre> 的类样式字体不可靠，会回退成普通字形显得“异常”。
        // 这里内联等宽字体强制一致（Consolas 优先，缺失回退 Courier New，均为系统自带）。
        root.querySelectorAll('.milkdown-code-block pre, .milkdown-code-block code').forEach(el => {
            let s = el.getAttribute('style') || '';
            el.setAttribute('style', s + ';font-family:Consolas,"Courier New",monospace;');
        });
        root.querySelectorAll('del').forEach(del => {
            let span = document.createElement('span');
            span.setAttribute('style', 'text-decoration:line-through;');
            while(del.firstChild) span.appendChild(del.firstChild);
            del.parentNode.replaceChild(span, del);
        });
        root.querySelectorAll('a').forEach(a => {
            let font = a.closest('h1,h2,h3,h4,h5,h6') ? WORD_TITLE_FONT : WORD_FONT;
            let style = a.getAttribute('style') || '';
            a.setAttribute('style', style + ';font-family:' + font + ';color:#409eff;text-decoration:none;');
        });
        root.querySelectorAll('li .label-wrapper').forEach(el => el.remove());
        root.querySelectorAll('div.milkdown-list-item-block, div.content-dom, li > div.children').forEach(Unwrap);
        // Word 会把 <li><p>文本</p></li> 里的 li 空段和内层 p 段各识别成一个带编号的列表行，
        // 于是“一个列表项显示成两个编号行 + 一个换行”。这里去掉 li 内只含行内内容的内层 <p>，
        // 让 <li> 直接包住行内文本，Word 只生成一个编号行。
        root.querySelectorAll('li > p').forEach(p => {
            if(!p.querySelector('div, p, ul, ol, table, pre, blockquote, hr')) Unwrap(p);
        });
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

    // 获取内嵌资源（milkdown css + 导出专用 css）。KaTeX 字体只在文档含数学公式时才内嵌，
    // 所以按 hasMath 分缓存，避免无公式文档也带上约 1.4MB 的字体。
    async function FetchAssets(hasMath){
        if(assetsCache && assetsCache.hasMath === hasMath) return assetsCache;
        let resp = await CallSysSlot('export-assets', 'export-assets-result', {math: hasMath});
        if(!resp || resp.error) throw new Error(resp && resp.error || '获取导出资源失败');
        resp.hasMath = hasMath;
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
        if(format === 'doc'){
            ApplyWordCompat(docNode);
            css += '\n' + WORD_COMPAT_CSS;
        }
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
        if(format === 'doc') return '.docx';
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
            // 只有当文档实际包含数学公式(.katex)时才内嵌 KaTeX 字体，否则不内嵌
            let hasMath = !!(cloned && cloned.querySelector('.katex'));
            let assets = await FetchAssets(hasMath);
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
