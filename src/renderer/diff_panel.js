/**
 * 显示笔记差异
 * @param {*} pre_content 前一个版本的内容
 * @param {*} cur_content 当前版本的内容
 * @param {*} diff_mode 差异模式，line表示按行对比，word表示按单词对比，char表示按字符对比，默认按行对比
 */
function ShowDiff(pre_content, cur_content, diff_mode='line'){
    var color = '', span = null;

    // 如果内容相同则弹框提示
    if(pre_content === cur_content){
        MyModal.Alert("内容相同，无差异");
        return;
    }

    // 使用可滚动的两列布局：左侧行为行号，右侧为内容；整体容器保留 id='diff-info' 以兼容滚动/跳转逻辑
    var display = $("<div id='diff-info' class='diff-view'></div>");
    var gutter = document.createElement('div');
    gutter.className = 'diff-gutter';
    var content = document.createElement('div');
    content.className = 'diff-content';

    // 行号计数器：针对最终版本（cur_content）所有非-removed 的行都参与计数（包括不变的数据）
    var finalLineNo = 1;

    var diff;
    if(diff_mode == 'char'){
        diff = Diff.diffChars(pre_content, cur_content);
    }else if(diff_mode == 'word'){
        diff = Diff.diffWords(pre_content, cur_content);
    }else{
        diff = Diff.diffLines(pre_content, cur_content);
    }
    // 会话级保存设置（内存中），每次打开比较界面生效但不写入磁盘
    if(typeof window._diff_saved_settings === 'undefined') window._diff_saved_settings = {};
    var _diff_saved_settings = window._diff_saved_settings;

    // render 函数：根据 filterRegexStr 与 showOnlyChanges 设置渲染内容
    function render(filterRegexStr, showOnlyChanges){
        // 清空容器
        gutter.innerHTML = '';
        content.innerHTML = '';

        // 预编译正则（如果有）
        var re = null;
        if(filterRegexStr && filterRegexStr.length > 0){
            try{
                re = new RegExp(filterRegexStr);
            }catch(e){
                // 如果正则非法，则忽略过滤
                re = null;
            }
        }

        // 行号计数器：针对最终版本（cur_content）所有非-removed 的行都参与计数（包括不变的数据）
        var localFinalLineNo = 1;

        diff.forEach(function(part){
            var partColor = part.added ? 'green' : part.removed ? 'red' : '';
            var lines = part.value.split(/\r?\n/);
            if(lines.length > 0 && /\r?\n$/.test(part.value)){
                lines.pop();
            }
            var isRemoved = !!part.removed;

            for(var i = 0; i < lines.length; i++){
                var cur_line = lines[i];

                // 当前行在最终版本的行号（仅在非-removed 时递增）
                var currentLineNo = null;
                if(!isRemoved){
                    currentLineNo = localFinalLineNo;
                    localFinalLineNo++;
                }

                // 过滤与“仅显示变更”判定（注意：即便被过滤，行号仍按未过滤数据计算）
                var shouldRender = true;
                if(re){
                    // 对文本进行匹配（对 removed/added/unchanged 均使用该文本）
                    shouldRender = re.test(cur_line);
                }
                if(showOnlyChanges && partColor === ''){
                    shouldRender = false;
                }

                if(!shouldRender){
                    // 即不渲染该行，但如果是非 removed，则行号计数已增加
                    continue;
                }

                // gutter: 只有非-removed 的行显示行号，removed 显示占位
                var gutterLine = document.createElement('div');
                gutterLine.className = 'diff-gutter-line';
                if(!isRemoved){
                    gutterLine.appendChild(document.createTextNode(currentLineNo));
                }else{
                    gutterLine.appendChild(document.createTextNode(''));
                }
                gutter.appendChild(gutterLine);

                // content: 每一行作为独立元素
                var contentLine = document.createElement('div');
                contentLine.className = 'diff-content-line';
                if(partColor === ''){
                    contentLine.appendChild(document.createTextNode(cur_line));
                }else{
                    var inner = document.createElement('span');
                    inner.className = 'diff-span ' + partColor;
                    if(cur_line === ''){
                        var zwc_ele = document.createElement('span');
                        zwc_ele.className = 'diff-line-break';
                        inner.appendChild(zwc_ele);
                    }else{
                        inner.appendChild(document.createTextNode(cur_line));
                    }
                    contentLine.appendChild(inner);
                }
                content.appendChild(contentLine);
            }
        });

        // 根据最终行号计算 gutter 宽度（按数字位数估算）
        var maxLine = Math.max(1, localFinalLineNo - 1);
        var digits = String(maxLine).length;
        var gutterWidth = Math.min(200, Math.max(20, digits * 9 + 12));
        gutter.style.width = gutterWidth + 'px';

        // 将容器插入显示面板（如果尚未插入）
        // `display` 是 jQuery 对象，使用其 DOM 元素进行 contains/append 操作
        var dispEl = (display && display.length) ? display[0] : display;
        if(dispEl && typeof dispEl.contains === 'function'){
            if(!dispEl.contains(gutter)) dispEl.appendChild(gutter);
            if(!dispEl.contains(content)) dispEl.appendChild(content);
        }else{
            // 回退到 jQuery append
            if(display && display.append){
                display.append(gutter);
                display.append(content);
            }
        }
    }

    // 首次渲染：使用已保存设置（如果有），否则显示全部
    var initRegex = _diff_saved_settings.regex || '';
    var initOnly = !!_diff_saved_settings.onlyChanges;
    render(initRegex, initOnly);
    MyModal.Info(display, "note diff", '1000px', '600px', 'diff');

    // 设置跳转到上一个及下一个变更的位置的按钮
    var diff_btns = $("<div class='diff-btns'></div>");
    var top_btn = $("<button class='btn btn-default diff-top-btn' title='跳转到第一个变更'><span class='glyphicon glyphicon-arrow-up'></span></button>");
    var pre_btn = $("<button class='btn btn-default diff-pre-btn' title='前一个变更'><span class='glyphicon glyphicon-chevron-up'></span></button>");
    var next_btn = $("<button class='btn btn-default diff-next-btn' title='后一个变更'><span class='glyphicon glyphicon-chevron-down'></button>");
    // 添加拷贝之前之后的内容按钮
    var pre_copy_btn = $("<button class='btn btn-default diff-pre-copy-btn' title='拷贝原始数据内容'><span class='glyphicon glyphicon-file'> </span></button>");

    var settings_btn = $("<button class='btn btn-default diff-settings-btn' title='显示/过滤设置'><span class='glyphicon glyphicon-cog'></span></button>");

    diff_btns.append(top_btn);
    diff_btns.append(pre_btn);
    diff_btns.append(next_btn);
    diff_btns.append(pre_copy_btn);
    diff_btns.append(settings_btn);

    pre_btn.click(()=>{
        var cur_span_parent = $("#diff-info");
        var cur_span_parent_scroll_top = cur_span_parent.scrollTop();
        var find_flag = false;
        // 倒序遍历#diff-info内的span元素
        $($("#diff-info .diff-span").toArray().reverse()).each(function(index, ele_dom){
            // 遍历#diff-info内的span元素，找到位于可视区域的前一个span元素
            var cur_span = $(ele_dom);
            // 相对于可视区域的位置
            var cur_span_top = cur_span.position().top;
            if(cur_span_top < 0){
                cur_span_parent.scrollTop(cur_span_parent_scroll_top + cur_span_top - 30);
                find_flag = true;
                return false;
            }
        });
        if(!find_flag){
            // 提示已无数据
            MyModal.Alert("已到顶");
        }
    });
    next_btn.click(()=>{
        var cur_span_parent = $("#diff-info");
        var cur_span_parent_scroll_top = cur_span_parent.scrollTop();
        var find_flag = false;
        // 顺序遍历#diff-info内的span元素
        $("#diff-info .diff-span").each(function(index, ele_dom){
            // 遍历#diff-info内的span元素，找到位于可视区域的前一个span元素
            var cur_span = $(ele_dom);
            // 相对于可视区域的位置
            var cur_span_top = cur_span.position().top;
            if(cur_span_top > 0){
                if(cur_span_top < cur_span_parent.height()){
                    return; // continue
                }
                cur_span_parent.scrollTop(cur_span_parent_scroll_top + cur_span_top - 30);
                find_flag = true;
                return false;
            }
        });
        if(!find_flag){
            // 提示已无数据
            MyModal.Alert("已到底");
        }
    });
    top_btn.click(()=>{
        var cur_span_parent = $("#diff-info");
        cur_span_parent.scrollTop(0);
        // 跳转到第一个变更
        var first_span = $("#diff-info .diff-span").first();
        if(first_span.length > 0){
            var first_span_top = first_span.position().top;
            cur_span_parent.scrollTop(first_span_top - 30);
        }
    });

    pre_copy_btn.click(()=>{
        CopyText(pre_content);
    });

    // 设置按钮：打开弹窗，允许输入行文本过滤正则以及是否只显示变更
    settings_btn.click(()=>{
        // 使用已保存的默认值回显
        var saved = _diff_saved_settings || {};
        var savedRegex = saved.regex || '';
        var savedOnly = saved.onlyChanges ? 'checked' : '';
        var html = `
        <div class='form-group'>
            <label>行文本过滤正则（空为不使用）</label>
            <input type='text' id='diff-settings-regex' class='form-control' placeholder='例如: ^ERROR' value="${savedRegex}">
        </div>
        <div class='form-group'>
            <label><input type='checkbox' id='diff-settings-only-changes' ${savedOnly}> 只显示变更行</label>
        </div>`;
        MyModal.Alert(html, function(){
            var regexStr = $('#diff-settings-regex').val() || '';
            var onlyChanges = $('#diff-settings-only-changes').is(':checked');
            // 验证正则
            if(regexStr){
                try{ new RegExp(regexStr); }catch(e){ MyModal.Alert('正则表达式无效: ' + e); return; }
            }
            // 保存设置到会话内存（不写入磁盘）
            _diff_saved_settings.regex = regexStr;
            _diff_saved_settings.onlyChanges = onlyChanges;
            // 重新渲染 diff（行号仍使用未过滤的计数）
            render(regexStr, onlyChanges);
        }, 600, 180, 'Diff Settings');
    });

    display.append(diff_btns);
}

/**
 * 弹框显示diff工具面板
 */
function ShowDiffToolPanel(){
    function DiffCompare(diff_mode, sort_compare=false){
        // 确定按钮点击逻辑
        var pre_content = $("#diff-tool-left").val();
        var cur_content = $("#diff-tool-right").val();
        
        // 如果启用了排序比较，则对内容进行处理
        if(sort_compare){
            // 按英文逗号、空格、制表符、换行符等字符进行切割排序，并需要去除空字符串
            pre_content = pre_content.split(/[,\s]+/).filter(Boolean).sort().join('\n') + '\n';
            cur_content = cur_content.split(/[,\s]+/).filter(Boolean).sort().join('\n') + '\n';
        }
        
        // 如果只有pre_content有内容，则对pre_content的前后对半行进行比对
        if(pre_content && !cur_content){
            let content_lines = pre_content.split('\n');
            let pre_content_lines = Math.ceil(content_lines.length / 2);
            pre_content = content_lines.slice(0, pre_content_lines).join('\n');
            cur_content = content_lines.slice(pre_content_lines).join('\n');
        }
        ShowDiff(pre_content, cur_content, diff_mode);
        // 不知为何调用ShowDiff后本模态框被关闭
        $("#my-confirm").modal('show');
    }
    let html = `<div class='diff-tool-div'>
        <textarea id='diff-tool-left' class='diff-tool-value' spellcheck='false'></textarea>
        <textarea id='diff-tool-right' class='diff-tool-value' spellcheck='false'></textarea>
        <div id='diff-panel-options'>
            <div class="checkbox-group diff-panel-options-group">
                <label><input type="checkbox" id="diff-panel-sort-compare" name="sort-compare" title="按英文逗号、空格、制表符、换行符等字符进行切割排序"> 自动切割排序</label>
            </div>
            <div class="diff-panel-options-group" id="diff-mode-group" role="group" aria-label="Diff Mode">
                <button type="button" class="btn btn-default diff-mode-btn" data-mode="char">按字符比较</button>
                <button type="button" class="btn btn-default diff-mode-btn" data-mode="word">按单词比较</button>
                <button type="button" class="btn btn-default diff-mode-btn active" data-mode="line">按行比较</button>
            </div>
        </div>
        </div>`;
    MyModal.Info(html, title='Text Compare Tool', width=1000, height=550, 'diff-panel');
    // 按钮切换diff模式（设置active样式）
    $("#diff-panel-options .diff-mode-btn").off('click').on('click', function(){
        $("#diff-panel-options .diff-mode-btn").removeClass('active');
        $(this).addClass('active');
        const diffMode = $('#diff-panel-options .diff-mode-btn.active').data('mode') || 'line';
        const sortCompare = $('#diff-panel-sort-compare').is(':checked');
        DiffCompare(diffMode, sortCompare);
    });
    // 设置两个textarea的滚动条同步
    $("#diff-tool-left").off('scroll').on('scroll', function(){
        $("#diff-tool-right").scrollTop($(this).scrollTop());
    });
    $("#diff-tool-right").off('scroll').on('scroll', function(){
        $("#diff-tool-left").scrollTop($(this).scrollTop());
    });
}