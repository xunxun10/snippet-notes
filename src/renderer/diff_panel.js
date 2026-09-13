/**
 * 显示笔记差异
 * @param {*} pre_content 前一个版本的内容
 * @param {*} cur_content 当前版本的内容
 * @param {*} diff_mode 差异模式，line表示按行对比，word表示按单词对比，char表示按字符对比；不传时优先使用diff设置中保存的模式，默认按字母
 */
function ShowDiff(pre_content, cur_content, title='note diff', diff_mode=null){
    var color = '', span = null;

    // 如果内容相同则弹框提示
    if(pre_content === cur_content){
        MyModal.Alert("内容相同，无差异");
        return;
    }

    // 会话级保存设置（内存中），每次打开比较界面生效但不写入磁盘
    if(typeof window._diff_saved_settings === 'undefined') window._diff_saved_settings = {};
    var _diff_saved_settings = window._diff_saved_settings;

    // 比对模式：显式传入的diff_mode优先，其次使用diff设置中保存的模式，默认按字母
    var mode = diff_mode || _diff_saved_settings.mode || 'char';

    // 使用可滚动的两列布局：左侧行为行号，右侧为内容；整体容器保留 id='diff-info' 以兼容滚动/跳转逻辑
    var display = $("<div id='diff-info' class='diff-view'></div>");
    var gutter = document.createElement('div');
    gutter.className = 'diff-gutter';
    var content = document.createElement('div');
    content.className = 'diff-content';

    // 行号计数器：针对最终版本（cur_content）所有非-removed 的行都参与计数（包括不变的数据）
    var finalLineNo = 1;

    var diff;
    // 如果cur_content末尾不是换行符，则两边各增加一个换行符
    if(!/^\r?\n$/.test(cur_content)){
        pre_content += '\n';
        cur_content += '\n';
    }
    // 根据比对模式计算差异
    function computeDiff(cur_mode){
        if(cur_mode == 'char'){
            return Diff.diffChars(pre_content, cur_content);
        }else if(cur_mode == 'word'){
            return Diff.diffWords(pre_content, cur_content);
        }
        return Diff.diffLines(pre_content, cur_content);
    }
    diff = computeDiff(mode);

    // render 函数：根据 filterRegexStr 与 showOnlyChanges 设置渲染内容
    function render(filterRegexStr, showOnlyChanges, excludeRegexStr){
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

        // 预编译排除正则（如果有）
        var excludeRe = null;
        if(excludeRegexStr && excludeRegexStr.length > 0){
            try{
                excludeRe = new RegExp(excludeRegexStr);
            }catch(e){
                // 如果正则非法，则忽略过滤
                excludeRe = null;
            }
        }

        // 先将diff parts按行分组：每个元素为 {segs:[{text,color}], hasChange, isRemovedLine}
        // 以便"只显示变更行"按整行判定，保证有变更的行完整显示
        var lineGroups = [];
        var curSegs = [];
        var curHasChange = false;
        var curIsAllRed = true;    // 当前行是否全部为删除内容（纯删除行）
        var curHasContent = false; // 当前行是否有内容（含空行变更）

        function pushSeg(text, color){
            // 只要存在非删除（绿色/未变更）内容，该行就不是纯删除行
            if(color !== 'red'){ curIsAllRed = false; }
            if(color !== ''){ curHasChange = true; }
            curHasContent = true;
            var last = curSegs[curSegs.length - 1];
            if(last && last.color === color){
                last.text += text;
            }else{
                curSegs.push({text: text, color: color});
            }
        }
        function endLine(){
            lineGroups.push({segs: curSegs, hasChange: curHasChange, isRemovedLine: curHasContent && curIsAllRed});
            curSegs = [];
            curHasChange = false;
            curIsAllRed = true;
            curHasContent = false;
        }

        diff.forEach(function(part){
            var partColor = part.added ? 'green' : part.removed ? 'red' : '';
            var lines = part.value.split(/\r?\n/);
            // Check if the part ends with a newline - if not, the last element in lines is not a complete line
            var partEndsWithNewline = /\r?\n$/.test(part.value);
            if(lines.length > 1 && partEndsWithNewline){
                lines.pop(); // Remove the empty string after the final newline
            }

            for(var i = 0; i < lines.length; i++){
                var isLineEnd = (i < lines.length - 1) || partEndsWithNewline;
                pushSeg(lines[i], partColor);
                if(isLineEnd){
                    endLine();
                }
            }
        });
        // 末尾未换行的残段也作为一行处理
        if(curHasContent){
            endLine();
        }

        // 行号计数器：针对最终版本（cur_content）所有非-removed 的行都参与计数（包括不变的数据）
        var localFinalLineNo = 1;

        lineGroups.forEach(function(group){
            // 整行文本（用于正则过滤）
            var lineText = group.segs.map(function(s){ return s.text; }).join('');

            // 过滤与"仅显示变更"判定（注意：即便被过滤，行号仍按未过滤数据计算）
            var shouldRender = true;
            if(re){
                shouldRender = re.test(lineText);
            }
            // 排除正则过滤：满足排除正则的行不显示
            if(excludeRe && excludeRe.test(lineText)){
                shouldRender = false;
            }
            if(showOnlyChanges && !group.hasChange){
                shouldRender = false;
            }

            // 当前行在最终版本的行号：纯删除行不显示行号（占位），其余行都计数
            var currentLineNo = null;
            var isEmptyLineNo = false;
            if(!group.isRemovedLine){
                currentLineNo = localFinalLineNo;
                localFinalLineNo++;
            }else{
                isEmptyLineNo = true;
            }

            if(!shouldRender){
                return;
            }

            // gutter: 纯删除行显示占位，其余显示行号
            var gutterLine = document.createElement('div');
            gutterLine.className = 'diff-gutter-line';
            if(!isEmptyLineNo){
                gutterLine.appendChild(document.createTextNode(currentLineNo));
            }else{
                gutterLine.appendChild(document.createTextNode(''));
            }
            gutter.appendChild(gutterLine);

            // 内容：有变更的段着色，无变更的段以纯文本显示（整行完整输出）
            group.segs.forEach(function(seg){
                if(seg.color === ''){
                    content.appendChild(document.createTextNode(seg.text));
                }else{
                    var inner = document.createElement('span');
                    inner.className = 'diff-span ' + seg.color;
                    if(seg.text === ''){
                        var zwc_ele = document.createElement('span');
                        zwc_ele.className = 'diff-line-break';
                        inner.appendChild(zwc_ele);
                    }else{
                        inner.appendChild(document.createTextNode(seg.text));
                    }
                    content.appendChild(inner);
                }
            });
            content.appendChild(document.createElement('br'));
        });

        // 根据最终行号计算 gutter 宽度（按数字位数估算）
        var maxLine = Math.max(1, localFinalLineNo - 1);
        var digits = String(maxLine).length;
        var gutterWidth = Math.min(200, Math.max(20, digits * 8 + 7));

        // 计算 gutter 高度，确保背景色和边框完整显示
        var gutterHeight = gutter.children.length * 20 + 12; // 每行20px

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

        // 在添加到DOM后设置宽度和高度，确保样式生效
        gutter.style.width = gutterWidth + 'px';
        gutter.style.flex = '0 0 ' + gutterWidth + 'px'; // 设置flex属性以确保在flex容器中正确显示
        gutter.style.height = gutterHeight + 'px';
    }

    // 首次渲染：使用已保存设置（如果有）；"只显示变更行"默认勾选
    var initRegex = _diff_saved_settings.regex || '';
    var initOnly = _diff_saved_settings.onlyChanges !== false;
    var initExclude = _diff_saved_settings.excludeRegex || '';
    render(initRegex, initOnly, initExclude);
    MyModal.Info(display, title, '1000px', '600px', 'diff');

    // 设置跳转到上一个及下一个变更的位置的按钮
    var diff_btns = $("<div class='diff-btns'></div>");
    var top_btn = $("<button class='btn btn-default diff-top-btn' title='跳转到第一个变更'><span class='glyphicon glyphicon-arrow-up'></span></button>");
    var pre_btn = $("<button class='btn btn-default diff-pre-btn' title='前一个变更'><span class='glyphicon glyphicon-chevron-up'></span></button>");
    var next_btn = $("<button class='btn btn-default diff-next-btn' title='后一个变更'><span class='glyphicon glyphicon-chevron-down'></button>");
    // 添加拷贝之前之后的内容按钮
    var pre_copy_btn = $("<button class='btn btn-default diff-pre-copy-btn' title='拷贝原始数据内容'><span class='glyphicon glyphicon-file'> </span></button>");

    var settings_btn = $("<button class='btn btn-default diff-settings-btn' title='显示/过滤设置'><span class='glyphicon glyphicon-cog'></span></button>");

    // 根据设置状态更新图标
    function updateSettingsIcon(){
        var hasSettings = (_diff_saved_settings.regex || '') !== '' ||
                          (_diff_saved_settings.excludeRegex || '') !== '' ||
                          !!_diff_saved_settings.onlyChanges ||
                          (_diff_saved_settings.mode || '') !== 'char';
        var iconSpan = settings_btn.find('span');
        if(hasSettings){
            iconSpan.removeClass('glyphicon-cog').addClass('glyphicon-exclamation-sign');
        }else{
            iconSpan.removeClass('glyphicon-exclamation-sign').addClass('glyphicon-cog');
        }
    }
    updateSettingsIcon();

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
            MyModal.Toast("已到顶");
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
            MyModal.Toast("已到底");
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

    // 设置按钮：打开弹窗，可设置比对模式、行文本过滤正则以及是否只显示变更
    settings_btn.click(()=>{
        // 使用已保存的默认值回显
        var saved = _diff_saved_settings || {};
        var savedRegex = saved.regex || '';
        var savedOnly = (saved.onlyChanges !== false) ? 'checked' : '';
        var savedExclude = saved.excludeRegex || '';
        var modeCharChecked = mode === 'char' ? 'checked' : '';
        var modeWordChecked = mode === 'word' ? 'checked' : '';
        var modeLineChecked = mode === 'line' ? 'checked' : '';
        var html = `
        <div class='form-group'>
            <label>比对模式</label>
            <div>
                <label class='radio-inline'><input type='radio' name='diff-settings-mode' value='char' ${modeCharChecked}> 按字母</label>
                <label class='radio-inline'><input type='radio' name='diff-settings-mode' value='word' ${modeWordChecked}> 按单词</label>
                <label class='radio-inline'><input type='radio' name='diff-settings-mode' value='line' ${modeLineChecked}> 按行</label>
            </div>
        </div>
        <div class='form-group'>
            <label>行文本过滤正则（空为不使用）</label>
            <input type='text' id='diff-settings-regex' class='form-control' placeholder='例如: ^ERROR' value="${savedRegex}">
        </div>
        <div class='form-group'>
            <label>排除正则（满足此正则的行不显示）</label>
            <input type='text' id='diff-settings-exclude-regex' class='form-control' placeholder='例如: ^DEBUG' value="${savedExclude}">
        </div>
        <div class='form-group'>
            <label><input type='checkbox' id='diff-settings-only-changes' ${savedOnly}> 只显示变更行</label>
        </div>`;
        MyModal.Alert(html, function(){
            var modeStr = $('input[name="diff-settings-mode"]:checked').val() || 'char';
            var regexStr = $('#diff-settings-regex').val() || '';
            var excludeRegexStr = $('#diff-settings-exclude-regex').val() || '';
            var onlyChanges = $('#diff-settings-only-changes').is(':checked');
            // 验证正则
            if(regexStr){
                try{ new RegExp(regexStr); }catch(e){ MyModal.Alert('正则表达式无效: ' + e); return; }
            }
            if(excludeRegexStr){
                try{ new RegExp(excludeRegexStr); }catch(e){ MyModal.Alert('排除正则表达式无效: ' + e); return; }
            }
            // 保存设置到会话内存（不写入磁盘）
            _diff_saved_settings.mode = modeStr;
            _diff_saved_settings.regex = regexStr;
            _diff_saved_settings.excludeRegex = excludeRegexStr;
            _diff_saved_settings.onlyChanges = onlyChanges;
            // 更新设置图标
            updateSettingsIcon();
            // 按新模式重新计算差异并渲染（行号仍使用未过滤的计数）
            diff = computeDiff(modeStr);
            render(regexStr, onlyChanges, excludeRegexStr);
        }, 600, null, 'Diff Settings');
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
        ShowDiff(pre_content, cur_content, 'note diff', diff_mode);
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