// md 编辑器（Crepe）左侧目录（TOC）：解析 markdown 标题生成大纲，点击跳转
(function(){
    let tocItems = [];
    let tocEntries = []; // 与 tocItems 平行：{ item, el }

    function EscapeHtml(text){
        const map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
        return String(text).replace(/[&<>"']/g, c => map[c]);
    }

    // 解析 markdown 标题，跳过代码块内的 # 号
    function ParseMdToc(md){
        const items = [];
        let inCode = false;
        for(const line of String(md || '').split(/\r?\n/)){
            if(/^\s*```/.test(line)){ inCode = !inCode; continue; }
            if(inCode){ continue; }
            const m = line.match(/^(#{1,6})\s+(.+)$/);
            if(!m){ continue; }
            items.push({
                level: m[1].length,
                text: m[2].replace(/[*_`~]/g, '').trim(),
            });
        }
        return items;
    }

    // 按标题层级生成自动序号（1、1.1、1.1.1）。
    // 起点规则：若只有一个一级标题（作文档总标题），编号从二级开始且该 h1 不编号；否则从一级开始。
    // 返回与 items 平行的序号数组（不编号的标题为空串）。
    function ComputeNumbers(items){
        const h1Count = items.filter(i => i.level === 1).length;
        const start = h1Count === 1 ? 2 : 1;
        const counts = [];
        return items.map(item=>{
            if(item.level < start){ return ''; } // 起始层之上的标题（单 h1 文档的 h1）不编号
            const idx = item.level - start; // 当前层级在计数数组中的索引
            // 仅丢弃比当前层更深的计数（保留 0..idx），父级计数保留
            if(counts.length > idx + 1){ counts.length = idx + 1; }
            counts[idx] = (counts[idx] || 0) + 1;
            return counts.join('.');
        });
    }

    // 自动编号判断：若第一个二级标题已手动带编号（如“1.2 xxx”“一、xxx”），则整篇不再自动追加
    // 编号形式：阿拉伯数字或中文数字（一二三…）开头，后跟空格或 . - 、 ． 等分隔符
    function DetectManualNumber(items){
        const probe = items.find(i => i.level === 2) || items[0];
        if(!probe){ return false; }
        return /^\s*(?:\d+(?:[.\-、．]\d+)*|[零一两二三四五六七八九十百千万]+)(?:\s*[.\-、．]\s*|\s+)\S/.test(probe.text);
    }

    function RenderToc(){
        const box = $("#md-toc");
        box.empty();
        tocEntries = [];
        if(!tocItems.length){
            box.append('<div class="toc-empty">无目录（未使用标题）</div>');
            return;
        }
        const numbers = ComputeNumbers(tocItems);
        const manual = DetectManualNumber(tocItems);
        tocItems.forEach((item, i)=>{
            const pad = 10 + (item.level - 1) * 14;
            const label = manual ? item.text : ((numbers[i] || '') + ' ' + item.text).trim();
            const el = $('<a class="toc-item" href="javascript:void(0)"></a>')
                .css('padding-left', pad + 'px')
                .text(label)
                .on('click', function(){ ScrollToTocItem(item); })
                .appendTo(box);
            tocEntries.push({ item, el });
        });
        BindFollow();
    }

    // 查找 md 编辑器内容区的滚动容器
    function FindScrollContainer(){
        const pm = document.querySelector('#md-editor .ProseMirror');
        if(!pm){ return null; }
        let el = pm;
        while(el && el !== document.body){
            const oy = getComputedStyle(el).overflowY;
            if(oy === 'auto' || oy === 'scroll' || oy === 'overlay'){ return el; }
            el = el.parentElement;
        }
        return pm;
    }

    // 文档内标题元素 -> tocItems 索引：同名标题按出现次序一一对应
    function HeadingElToTocIndex(el){
        const doc = document.querySelector('#md-editor .ProseMirror');
        if(!doc){ return -1; }
        const text = el.textContent.trim();
        let occur = 0;
        for(const h of doc.querySelectorAll('h1,h2,h3,h4,h5,h6')){
            if(h === el){ break; }
            if(h.textContent.trim() === text){ occur++; }
        }
        let n = 0;
        for(let i = 0; i < tocItems.length; i++){
            if(tocItems[i].text === text){
                if(n === occur){ return i; }
                n++;
            }
        }
        return -1;
    }

    // 滚动时：高亮判定线（视口顶部下方 40px）上方最近的标题
    function HighlightActive(){
        const sc = FindScrollContainer();
        const doc = document.querySelector('#md-editor .ProseMirror');
        if(!sc || !doc || !tocEntries.length){ return; }
        const lineY = sc.getBoundingClientRect().top + 40;
        let idx = -1;
        for(const h of doc.querySelectorAll('h1,h2,h3,h4,h5,h6')){
            if(h.getBoundingClientRect().top <= lineY){
                const j = HeadingElToTocIndex(h);
                if(j >= 0){ idx = j; }
            }
        }
        SetActive(idx);
    }

    // 点击 / 光标移动时：高亮光标所在章节（光标之前最近的标题，含光标在标题内）
    function HighlightByCaret(){
        const doc = document.querySelector('#md-editor .ProseMirror');
        if(!doc || !tocEntries.length){ return; }
        const sel = window.getSelection();
        if(!sel || !sel.anchorNode || !doc.contains(sel.anchorNode)){ return; }
        const F = Node.DOCUMENT_POSITION_FOLLOWING, C = Node.DOCUMENT_POSITION_CONTAINED_BY;
        let idx = -1;
        for(const h of doc.querySelectorAll('h1,h2,h3,h4,h5,h6')){
            const pos = h.compareDocumentPosition(sel.anchorNode);
            if(pos & (F | C)){
                const j = HeadingElToTocIndex(h);
                if(j >= 0){ idx = j; }
            }
        }
        SetActive(idx);
    }

    function SetActive(idx){
        tocEntries.forEach((e, i)=>{
            if(i === idx){ e.el.addClass('active'); }
            else { e.el.removeClass('active'); }
        });
        EnsureTocVisible(idx);
    }

    // 高亮项若在目录可视区外（被滚动条遮挡），滚动目录使其可见（即时滚动）
    function EnsureTocVisible(idx){
        if(idx < 0){ return; }
        const box = document.getElementById('md-toc');
        const el = tocEntries[idx].el[0];
        if(!box || !el){ return; }
        const top = el.offsetTop, bottom = top + el.offsetHeight;
        if(top < box.scrollTop){ box.scrollTop = top; }
        else if(bottom > box.scrollTop + box.clientHeight){ box.scrollTop = bottom - box.clientHeight; }
    }

    // 跟随监听：滚动按视口位置刷新；点击/键盘移动按光标章节刷新。仅绑定一次，文档切换复用同一容器
    function BindFollow(){
        const sc = FindScrollContainer();
        if(!sc){ return; }
        if(!sc._followBound){
            sc._followBound = true;
            sc.addEventListener('scroll', HighlightActive);
            sc.addEventListener('click', HighlightByCaret);
            sc.addEventListener('mouseup', HighlightByCaret);
            sc.addEventListener('keyup', HighlightByCaret);
        }
        requestAnimationFrame(HighlightActive);
    }

    // 同一文本标题可能出现多次，取其在 markdown 中的出现次序，避免跳错
    function ScrollToTocItem(item){
        const occur = tocItems.filter(x => x.text === item.text).indexOf(item);
        const index = tocItems.indexOf(item); // 全局索引，用于目录高亮
        const doc = document.querySelector('#md-editor .milkdown .ProseMirror');
        if(!doc){ return; }
        let count = 0, el = null;
        for(const e of doc.querySelectorAll('h1,h2,h3,h4,h5,h6')){
            if(e.textContent.trim() === item.text){
                if(count === occur){ el = e; break; }
                count++;
            }
        }
        if(el){ el.scrollIntoView({ behavior:'auto', block:'start' }); }
        SetActive(index); // 点击目录后同步高亮
    }

    window.MdToc = {
        update(md){
            tocItems = ParseMdToc(md);
            RenderToc();
        },
        show(){ $("#md-toc").show(); },
        hide(){ $("#md-toc").hide(); },
        // 编辑器创建完成后调用：update 执行时 ProseMirror 尚未挂载，跟随监听可能未绑定
        bind(){ BindFollow(); },
    };
})();