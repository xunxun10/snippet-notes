/// <reference path="./util/my_util.js" />

// 页面渲染逻辑

let note_data = { last_note_range:null, last_note:{}, first_open:true };
// 本地文件编辑模式状态（只支持md文件）
// files: [{path, name, content(磁盘已保存内容), working(编辑中内容), md_shown(该文件的编辑器模式)}]
let file_data = { mode:false, files:[], cur_index:-1 };
// 缓存上一次 gutter 的行文本，用于增量更新
// 缓存上一次 gutter 的内容（用于快速跳过无变更情况）
// (moved into function-private closure below)

// 监听后台发来的事件
if(typeof window.electronAPI != 'undefined'){
    window.electronAPI.OnBgErrorMsg((_event, value) => {
        MyModal.Alert("Error: " + value);
    })
    window.electronAPI.OnSysCall((_event, msg) => {
        let value = msg.data;
    
        console.debug("handle from sys: " + msg.type + ' ' + JSON.stringify(value).substring(0, 100))
    
        var ProcessSysCall = {
            "compare-text":function(v){
                // 进行文本对比
                ShowDiffToolPanel();
            },
            "modify-last-note":function(v){
                if(file_data.mode){
                    // 文件模式下只记录笔记数据（如保存完成通知），返回笔记模式时恢复显示
                    note_data.last_note = v;
                    return;
                }
                UpdateLastNote(v);
            },
            "show_search_results":function(v){
                ShwoResult(v);
            },
            "info-on-bg":function(v){
                Info(v);
            },
            "modal-to-web":function(v){
                // 从后台发来的消息，弹出模态框
                MyModal.Alert("<div class='ModalInfoDiv'>" + value + "</div>", null, 800);
            },
            "save-note":function(v){
                if(file_data.mode){
                    // 文件模式下保存当前本地文件
                    SaveCurLocalFile();
                }else{
                    SaveAndUpdateNote();
                }
            },
            "update-note-detail":function(v){
                UpdateDetail(v.name, v.id, v.content);
            },
            "check-modify-before-close":function(v){
                if(file_data.mode){
                    // 文件模式：检查所有打开文件的未保存修改
                    if(HasUnsavedFiles()){
                        MyModal.Confirm("本地文件有未保存修改，是否保存后退出 ？", function(){
                            SaveAllModifiedFiles();
                            CallSys("close-app");
                        }, function(){
                            Info("请先保存修改再退出");
                        }, { text:"丢弃变更", fun:function(){
                            CallSys("close-app");
                        }}, "文件内容已被修改", 600, 100);
                    }else{
                        CallSys("close-app");
                    }
                }else if(IsLastModify()){
                    MyModal.Confirm("是否丢弃修改,直接退出 ？", function(){
                        CallSys("close-app");
                    }, function(){
                        Info("请先保存修改再退出");
                    }, null, "笔记内容已被修改", 600, 100);
                }else{
                    CallSys("close-app");
                }
            },
            "trigger-open-file":function(v){
                // 菜单触发打开本地文件
                OpenLocalFileDialog();
            },
            "open-local-files":function(paths){
                // 文件选择对话框选择的文件：文件模式直接在当前窗口打开，笔记模式新开独立进程
                if(!Array.isArray(paths) || paths.length == 0) return;
                if(file_data.mode){
                    DoOpenFiles(paths);
                }else{
                    // 笔记模式：新开进程打开文件，当前笔记界面不受影响
                    CallSys('open-files-new-process', paths);
                }
            },
            "startup-open-local-files":function(paths){
                // 本进程启动参数携带的文件（即新开的文件进程），直接进入文件模式
                if(!Array.isArray(paths) || paths.length == 0) return;
                DoOpenFiles(paths);
            },
            "load-local-file":function(v){
                // 后台读取本地文件完成
                AddLocalFile(v.path, v.content);
            },
            "local-file-saved":function(v){
                // 后台保存本地文件完成
                let f = file_data.files.find(x => x.path === v.path);
                if(!f) return;
                f.content = v.content;
                if(file_data.files[file_data.cur_index] === f){
                    // 当前文件：working取编辑器实时内容（保存期间可能继续编辑）
                    f.working = GetCurModifyNoteContent();
                }else{
                    f.working = v.content;
                }
                Info("已保存《" + f.name + "》");
                RenderFileTabs();
            },
            'show-all-note-names':function(note_names){
                ShowNoteList(note_names);
            },
            'show-history-notes':function(notes_info){
                ShowHistoryNoteList(notes_info);
            },
            "show-note-his-diff":function(his_note){
                // 如果内容相同则提示
                if(his_note.content == note_data.last_note.content){
                    MyModal.Alert("历史笔记与当前笔记最新保存内容相同");
                    return;
                }
                ShowDiff(his_note.content, note_data.last_note.content);
            },
            "show-default-note":function(default_note_id){
                EditSearchDetail(default_note_id);
                note_data.first_open = true;
            },
        }
        ProcessSysCall[msg.type](value);
    })
}


// 向后台发送消息
function CallSys(type, obj=null){
    var msg = {type:type, data:obj}

    console.debug("send to sys: " + type + ' ' + MyString.LogData(obj, 200))

    if(typeof window.electronAPI != 'undefined'){
        window.electronAPI.CallSys(msg);
    }
}

function SaveAndUpdateNote(new_id = null){
    let content = GetCurModifyNoteContent();
    if(content == note_data.last_note.content){
        Info("数据未修改，无需保存");
        return;
    }
    Info('开始保存 ...');
    function GetTitle(content){
        let pos = content.indexOf('\n');
        return content.substr(0, pos == -1 ? content.length : pos)
    }
    if(new_id != null){
        // 修改当前并跳转到新笔记
        CallSys("save_and_up_note", {note:{
            id:note_data.last_note.id,
            name:GetTitle(content),
            content:content,
        }, new_note_id:new_id});
    }else{
        // 修改当前笔记
        CallSys("save_note", {
            id:note_data.last_note.id,
            name:GetTitle(content),
            content:content,
        });
    }
}


function Info(str){
    $('#bottom-info').text(MyDate.Now() + " " + str);
}

function ShowError(str){   
    MyModal.Alert("Error: " + str);
    // Info("Error: " + str);
}

function ShwoResult(v){
    $("#search-res").empty();
    for (var i = 0; i <v.length; i++) {
        let new_item = $('<pre class="res-item"></pre>');
        new_item.text( v[i].str);
        new_item.attr('nid', v[i].id);
        new_item.attr('key', v[i].key.join('|'));
        new_item.attr('range', v[i].range);
        let item_div = $('<fieldset class="snippet-item"> <legend class="res-item-title">' + v[i].name + '</legend></fieldset>');
        item_div.append(new_item)
        $("#search-res").append(item_div);
    }
    ShowBoard("#search-res-board");

    $(".res-item").dblclick(function(e) {
        let item_dom = $(e.target);
        ShowDetail(item_dom.attr("nid"), item_dom.attr("key"), item_dom.attr("range"));
        // EditSearchDetail(item_dom.attr("nid"), item_dom.attr("range"));
    });

    // 创建右键菜单
    $.contextMenu({
        // define which elements trigger this menu
        selector: ".res-item",
        // define the elements of the menu
        items: {
            edit: { name: "编辑", callback: function(key, opt){
                EditSearchDetail($(this).attr("nid"), $(this).attr("range"));
            }},
            detail: { name: "查看详情", callback: function(key, opt){
                var item_dom = $(this);
                ShowDetail(item_dom.attr("nid"), item_dom.attr("key"), item_dom.attr("range"));
            }},
        }
    });

    // 关键字着色,对每个res-item元素进行关键字着色，关键字为key属性
    $(".res-item").each(function(index, ele_dom){
        let ele = $(ele_dom);
        let key = ele.attr('key').split('|');
        for(var cur_key of key) {
            ele.mark(cur_key, {
                className: "mark-highlight",
                separateWordSearch:false,
            });
        }
    });

    Info("已更新" + v.length + "条搜索结果");
}

function ShowBoard(dom_str){
    $(".board").hide();
    $(dom_str).show();
}

// 首次打开及后续保存后更新界面显示数据
function UpdateLastNote(v){
    // 数据更新必须放在最前面，否则md编辑器打开会报异常
    note_data.last_note = v;
    var last_note_ele = $("#last-note");
    $("#last-note-title").text(v.name);
    last_note_ele.val(v.content)

    // 字体类型切换需在行号测量前完成，否则测量使用旧字体导致折行不准
    if(v.name[0] == '#'){
        // 设置字体为等宽字体
        last_note_ele.addClass('equal-width-font');
    }else{
        // 设置字体为默认字体
        last_note_ele.removeClass('equal-width-font');
    }

    // 同步左侧行号列
    // 大笔记的全量折行测量需模拟排版、较耗时，延后到首帧渲染后空闲时执行：
    // 先让笔记文本显示出来，行号列稍后跟上（完成后再补一次滚动同步对齐）。
    // 延迟执行时读取当前文本而非快照，期间若有编辑/模式切换也能测量到最新内容
    if(v.content && v.content.length > 50000){
        var run_gutter = function(){
            UpdateLastNoteGutter($("#last-note").val());
            $("#last-note").trigger('scroll');
        };
        if(window.requestIdleCallback){
            requestIdleCallback(run_gutter, {timeout: 500});
        }else{
            setTimeout(run_gutter, 50);
        }
    }else{
        UpdateLastNoteGutter(v.content);
        // 触发滚动同步
        $("#last-note").trigger('scroll');
    }

    // 根据文件标题自动确定编辑器类型
    if(note_data.first_open){
        // 首次打开时的逻辑
        // 文件加载或切换时如果当前标题以#开头则切换到md模式
        if(v.name[0] == '#'){
            ShowMdEditor();
            // 设置一定延时后重置界面大小，避免md还未初始化就绪
            setTimeout(InitSize, 1000);
        }else{
            // 文件加载或切换时如果当前标题不以#开头则切换到非md模式
            if(md_editor_state.shown){
                // 由于md中的文本有可能被自动格式化，因此不能更新到#last-note
                HideMdEditor(false);
            }
            InitSize();
        }
    }else{
        // 软件已打开，只是更新数据时的逻辑
        // 如果是md模式则重建编辑器以更新内容（#last-note 已在上面更新为 v.content）
        if(md_editor_state.shown){
            ShowMdEditor();
        }
    }

    // 触发input
    TriggerNoteInput();

    if(note_data.last_note_range){
        // 跳转到指定位置
        setTimeout(()=>{
            MyScroll.ToTextareaPosition('#last-note', note_data.last_note_range[0]);
            note_data.last_note_range = null;
        }, 300);
    }else{
        // 默认滚动到文件末尾
        if(note_data.first_open){
            // 大文本布局是渐进完成的，且行号列渲染会改变文本区宽度使内容重新换行，
            // 滚动后scrollHeight仍会增长，需监测并补滚至布局稳定
            var scroll_to_end = function(){
                last_note_ele.animate({scrollTop: last_note_ele.prop("scrollHeight") + 'px'}, 200, function(){
                    // 动画完成后重新同步行号滚动（animate 不触发 scroll 事件）
                    $("#last-note").trigger('scroll');
                });
            };
            scroll_to_end();
            var prev_h = last_note_ele.prop("scrollHeight");
            var watch_growth = function(left){
                var h = last_note_ele.prop("scrollHeight");
                if(h > prev_h + 5){
                    prev_h = h;
                    scroll_to_end();
                }
                if(left > 0) setTimeout(function(){ watch_growth(left - 1); }, 250);
            };
            setTimeout(function(){ watch_growth(7); }, 300);
            note_data.first_open = false;
        }
    }

    $("#edit-flag").removeClass('visible');
    Info("已重新加载《" + v.name + "》");
}


// 初始化上一次测量相关数据 (moved into function-private closure below)
// 更新左侧行号列（从0开始计数），保持与文本内容行数同步
/**
 * 更新编辑器左侧行号列
 * 
 * 标准做法（CodeMirror/Ace/Monaco 均采用此策略）：
 *   - 测量阶段：用隐藏 div 模拟 textarea 换行，计算每逻辑行的可视行数
 *   - 渲染阶段：从首个变更行开始全量重建 DOM（DOM 创建开销远小于测量开销）
 *   - 缓存：上次每行的可视行数 + 内容 + 宽度，用于增量跳过
 * 
 * 性能关键：offsetHeight 触发强制重排，只有内容/宽度变化时才需要重新测量。
 * 优化手段：通过正反向比较找到最小变更区间，只测变更行。
 */
const UpdateLastNoteGutter = (function(){
    var _prevContent = null;        // 上次完整内容
    var _prevWidth = null;           // 上次 textarea 可用宽度（px）
    var _prevVisualCounts = [];      // 上次每逻辑行的可视行数
    var _measureDiv = null;          // 复用的测量用隐藏 div
    var _prevFontSig = null;         // 上次测量时的字体签名（字体变化需重新测量）
    var _prevBase = null;            // 上次渲染的行号起始值（模式切换时需强制重绘）

    return function(content){
        var gutter = document.getElementById('last-note-gutter');
        var ta = document.getElementById('last-note');
        if (!gutter || !ta) return;

        // 行号起始值：文件模式从1开始，笔记模式保持从0开始
        var lineNoBase = file_data.mode ? 1 : 0;

        // 0. 分割逻辑行（提前，用于估算 gutter 宽度）
        var lines = (content == null) ? [''] : content.split('\n');

        // 0a. 预先估算 gutter 宽度并设置，稳定 flex 布局后再测量 clientWidth
        //     估算值偏保守（按逻辑行数算位数），精确值在步骤 9 修正
        var estDigits = String(Math.max(0, lines.length - 1)).length;
        var gutterW = Math.min(140, Math.max(20, estDigits * 8 + 8)) + 'px';
        gutter.style.width = gutterW;

        var style = window.getComputedStyle(ta);

        // 1. 计算当前可用宽度（textarea 内容区宽度）
        var paddingLeft = parseFloat(style.paddingLeft) || 0;
        var paddingRight = parseFloat(style.paddingRight) || 0;
        var contentWidth = Math.max(0, ta.clientWidth - paddingLeft - paddingRight);

        // 1a. 编辑区隐藏时（md模式下last-note-wrapper不可见）clientWidth为0，
        //     此时按0宽度测量会产生错误的折行缓存，直接跳过等待可见时再测量
        if (contentWidth <= 0) return;

        // 5. 初始化/更新测量用隐藏 div
        if (!_measureDiv) {
            _measureDiv = document.createElement('div');
            _measureDiv.style.position = 'absolute';
            _measureDiv.style.visibility = 'hidden';
            _measureDiv.style.top = '-9999px';
            _measureDiv.style.left = '-9999px';
            _measureDiv.style.whiteSpace = 'pre-wrap';
            // 与 textarea 折行行为完全一致（textarea 无 word-break/overflow-wrap 设置）
            _measureDiv.style.wordBreak = 'normal';
            _measureDiv.style.overflowWrap = 'normal';
            _measureDiv.style.boxSizing = 'content-box';
            _measureDiv.style.padding = '0px';
            _measureDiv.style.border = '0';
            _measureDiv.style.margin = '0';
            document.body.appendChild(_measureDiv);
        }

        // 5a. 字体变化时（笔记/文件模式切换等宽字体、md笔记自动切换字体等）
        //     同步测量div字体并使缓存失效，否则折行测量全部不准
        var fontSig = style.fontFamily + '|' + style.fontSize + '|' + style.lineHeight + '|' + style.fontWeight;
        if (_prevFontSig !== fontSig) {
            _prevFontSig = fontSig;
            _measureDiv.style.font = style.font;
            _measureDiv.style.fontSize = style.fontSize;
            _measureDiv.style.fontFamily = style.fontFamily;
            _measureDiv.style.lineHeight = style.lineHeight;
            _measureDiv.style.fontWeight = style.fontWeight;
            _prevContent = null;
            _prevVisualCounts = [];
        }

        // 2. 字体、内容、宽度和行号起始值都没变 → 无需任何操作
        if (_prevWidth === contentWidth && content === _prevContent && _prevBase === lineNoBase) return;

        _measureDiv.style.width = contentWidth + 'px';

        // 3.5 从测量 div 实测单行实际高度（比解析 style.lineHeight 精确）
        _measureDiv.textContent = 'x';
        var actualLineHeight = _measureDiv.offsetHeight;

        // 批量测量 [from, to) 行的可视行数：拼HTML一次性写入再统一读取高度，
        // 全程只触发一次强制布局（逐行 set+read 会每行都强制布局，大文件时慢一个数量级）
        var MeasureLines = function(from, to){
            var counts = new Array(Math.max(0, to - from));
            if(to <= from) return counts;
            var parts = new Array(to - from);
            for(var i = from; i < to; i++){
                // 转义文本避免内容中的标签被解析（& < > 足够，引号在文本节点无影响）
                parts[i - from] = '<div>' + String(lines[i] == '' ? ' ' : lines[i]).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
            }
            _measureDiv.innerHTML = parts.join('');
            var nodes = _measureDiv.childNodes;
            for(var i = 0; i < nodes.length; i++){
                counts[i] = Math.max(1, Math.ceil(nodes[i].offsetHeight / actualLineHeight - 0.001));
            }
            _measureDiv.textContent = '';
            return counts;
        };

        // 4. 计算每逻辑行的可视行数（行号起始值变化时走全量重建，否则内容未变时增量路径会跳过重绘）
        var cacheValid = (_prevWidth === contentWidth && _prevVisualCounts.length > 0 && _prevBase === lineNoBase);
        var visualCounts = new Array(lines.length);
        var totalVisual = 0;      // 总可视行数
        var startIdx = 0;         // 第一个需要重建 DOM 的逻辑行索引
        var suffixStart, oldSuffixStart; // 变更区间结束位置（增量渲染用）

        if (cacheValid) {
            // ----- 6a. 缓存有效：增量计算，只测变更行 -----
            var prevLines = _prevContent.split('\n');

            // 正向查找第一个变更行
            startIdx = 0;
            var minLen = Math.min(prevLines.length, lines.length);
            while (startIdx < minLen && prevLines[startIdx] === lines[startIdx]) startIdx++;

            if (startIdx < lines.length || lines.length !== prevLines.length) {
                // 反向查找最后一个变更行（从末尾向 startIdx 比较）
                suffixStart = lines.length;
                oldSuffixStart = prevLines.length;
                var li = prevLines.length - 1;
                var ci = lines.length - 1;
                while (li >= startIdx && ci >= startIdx && prevLines[li] === lines[ci]) {
                    li--;
                    ci--;
                }
                suffixStart = ci + 1;
                oldSuffixStart = li + 1;

                // 复制未变化的前缀
                for (var i = 0; i < startIdx; i++) {
                    visualCounts[i] = _prevVisualCounts[i];
                    totalVisual += visualCounts[i];
                }

                // 测量变更区间 [startIdx, suffixStart)
                var m_counts = MeasureLines(startIdx, suffixStart);
                for (var i = startIdx; i < suffixStart; i++) {
                    visualCounts[i] = m_counts[i - startIdx];
                    totalVisual += visualCounts[i];
                }

                // 复制未变化的后缀
                var offset = oldSuffixStart - suffixStart;
                for (var i = suffixStart; i < lines.length; i++) {
                    visualCounts[i] = _prevVisualCounts[i + offset];
                    totalVisual += visualCounts[i];
                }
            } else {
                // 完全没变化（极罕见，前面的 early-exit 应已拦截）
                return;
            }
        } else {
            // ----- 6b. 缓存无效：全量测量所有行 -----
            var m_counts = MeasureLines(0, lines.length);
            for (var i = 0; i < lines.length; i++) {
                visualCounts[i] = m_counts[i];
                totalVisual += visualCounts[i];
            }
        }

        // 7. 渲染 gutter 行号 DOM
        if (cacheValid) {
            // ----- 7a. 增量更新：只重建变更区间 [startIdx, suffixStart)，保留未变化后缀节点 -----
            // 删除旧变更区间节点 [startIdx, oldSuffixStart)
            var delEnd = Math.min(oldSuffixStart, gutter.childNodes.length);
            if (startIdx < delEnd) {
                var range = document.createRange();
                range.setStart(gutter, startIdx);
                range.setEnd(gutter, delEnd);
                range.deleteContents();
            }
            // 创建新变更区间节点 [startIdx, suffixStart)（空区间则不创建）
            var frag = document.createDocumentFragment();
            for (var i = startIdx; i < suffixStart; i++) {
                var cnt = visualCounts[i];
                var lnDiv = document.createElement('div');
                lnDiv.className = 'gutter-line';
                lnDiv.textContent = String(i + lineNoBase);
                lnDiv.style.height = (cnt * actualLineHeight) + 'px';
                frag.appendChild(lnDiv);
            }
            // 插入到 startIdx 位置（旧后缀节点之前）
            if (startIdx < gutter.childNodes.length) {
                gutter.insertBefore(frag, gutter.childNodes[startIdx]);
            } else {
                gutter.appendChild(frag);
            }
            // 若行数变化，更新后缀节点的行号和高度
            if (lines.length !== _prevContent.split('\n').length) {
                for (var i = suffixStart; i < lines.length; i++) {
                    var node = gutter.childNodes[i];
                    if (node) {
                        node.textContent = String(i + lineNoBase);
                        node.style.height = (visualCounts[i] * actualLineHeight) + 'px';
                    }
                }
            }
        } else {
            // ----- 7b. 全量重建：拼HTML一次性写入（比逐个createElement快数倍，行号为纯数字无转义问题） -----
            var html_parts = new Array(lines.length);
            for (var i = 0; i < lines.length; i++) {
                html_parts[i] = '<div class="gutter-line" style="height:' + (visualCounts[i] * actualLineHeight) + 'px">' + (i + lineNoBase) + '</div>';
            }
            gutter.innerHTML = html_parts.join('');
        }

        // 8. 缓存当前状态
        _prevContent = content;
        _prevWidth = contentWidth;
        _prevVisualCounts = visualCounts;
        _prevBase = lineNoBase;

        // 9. 自动调整 gutter 宽度（依据最大行号位数）
        try {
            var digits = String(Math.max(0, totalVisual - 1)).length;
            var gutterW = Math.min(140, Math.max(20, digits * 8 + 8)) + 'px';
            gutter.style.width = gutterW;
        } catch(e) { /* ignore */ }
    };
})();

var detail_data = {};
async function ShowDetail(note_id, key, range){
    CallSys("get-note-detail", note_id);
    detail_data.key = key.split('|');
    detail_data.range = range.split(',');
    ShowBoard("#res-detail-board");
}

function UpdateDetail(title, nid, content){
    $('#res-detail').prop('title', title)
    $('#res-detail').attr('nid', nid)
    $('#res-detail').attr('range', detail_data.range)
    $('#res-detail').text(content)

    // 跳转到指定位置
    setTimeout(()=>{ 
        MyScroll.ScrollToTextPosition('#res-detail', detail_data.range[0], detail_data.range[1], false);

        // 关键字着色
        for(var cur_key of detail_data.key) {
            $("#res-detail").mark(cur_key, {
                className: "mark-highlight",
                separateWordSearch:false,
            });
        }
    }, 200);
}

function GetCurModifyNoteContent(){
    if (md_editor_state.shown && md_editor_state.crepe){
        try {
            return md_editor_state.crepe.getMarkdown();
        } catch (error) {
            //ShowError("get md editor error, " + error);
            return $("#last-note").val();
        }
    }else{
        return $("#last-note").val();
    }
}

function IsLastModify(){
    if(file_data.mode){
        let f = CurFile();
        return f ? (GetCurModifyNoteContent() != f.content) : false;
    }
    return GetCurModifyNoteContent() != note_data.last_note.content;
}

async function EditSearchDetail(detail_id, range = null){
    function LoadAndJupmToNote(note_id, range){
        if(range != null){
            note_data.last_note_range = range.split(',');
        }
    
        HideMdEditor(false);
        // 拉取最新的note进行编辑
        CallSys('get-last-note', note_id)
    
        ShowBoard('#last-note-board');
    }

    if(IsLastModify()){
        MyModal.Confirm("笔记内容本地变更尚未保存，是否保存后跳转（取消按钮表示既不保存也不跳转）？", function(){
            // 保存last note并拉取选中的笔记
            SaveAndUpdateNote(detail_id);
            LoadAndJupmToNote(detail_id, range);
        }, function(){
            Info("需要保存修改内容后才能进行新内容编辑，已取消进入新内容编辑");
        },{ text:"丢弃变更", fun:function(){
            Info("已丢弃当前笔记变更");
            LoadAndJupmToNote(detail_id, range);
        }});
    }else{
        LoadAndJupmToNote(detail_id, range);
    }
}

function InitSize(){
    if(file_data.mode){
        // 文件模式无搜索区，编辑区更高
        $(".board").css('height', ($(window).height() - 51) + 'px');
    }else{
        $(".board").css('height', ($(window).height() - 98) + 'px');
    }
    $("#res-detail").css('max-height', ($(window).height() - 120) + 'px');
    // 如果为md编辑器模式则重置md编辑器大小
    if(md_editor_state.shown){
        // 当前内容同步到textarea后重建，以应用新的高度；'self'保持重建前的浏览位置
        $("#last-note").val(GetCurModifyNoteContent());
        ShowMdEditor('self');
    }
}

// 触发last-note input事件，以设置edit-flag的显示状态等
function TriggerNoteInput(){
    // 设置1秒定时器，防止频繁触发input事件
    MyTimer.Debounce(()=>{
        $("#last-note").trigger('input');
    }, 500, 'triggrt-input')();
}

let md_editor_state = { shown: false, crepe: null };
// 计算当前可见导航栏高度（笔记模式与文件模式使用不同导航栏）
function GetNavTabsHeight(){
    return (file_data.mode ? $("#file-nav-tabs") : $("#note-nav-tabs")).outerHeight();
}
// 计算 md 编辑器高度：board 可用空间 = board高度 - nav-tabs高度
function GetEditorHeight(){
    return $("#last-note-board").height() - GetNavTabsHeight();
}

// ================= md/文本模式切换时的位置互相同步 =================
// 归一化锚点文本：去除空白与常见md语法字符，使源码行与渲染块文本可互相对应匹配
function MdPosNormalize(s){
    return String(s || "").replace(/[\s#*_`~>$|\[\]()!+-]/g, "");
}
// 取idx所在行的文本作为锚点；空行或纯语法行（代码围栏/分隔线/表格分隔行）向后顺延到最近的内容行
function TextAnchorAt(val, idx){
    let p = Math.max(0, Math.min(idx, val.length));
    for(let k = 0; k < 8 && p <= val.length; k++){
        const ls = p > 0 ? val.lastIndexOf('\n', p - 1) + 1 : 0;
        let le = val.indexOf('\n', p);
        if(le < 0){ le = val.length; }
        const line = val.substring(ls, le).trim();
        if(line && !/^(`{3,}|~{3,}|-{3,}$|={3,}$|\*{3,}$)/.test(line) && !/^\|[\s:\-|]*$/.test(line)){
            return line.substring(0, 40);
        }
        if(le >= val.length){ break; }
        p = le + 1;
    }
    return "";
}
// 捕获文本编辑器当前位置：光标在可视区内时以光标行为锚点，否则以滚动比例估算可视区顶部行为锚点
// 可视区判定用内容占比而非行号（软折行时行号与像素不对应，占比判断更稳）
function CaptureTextPos(){
    const pos = { anchor: "", ratio: 0 };
    const ta = document.getElementById('last-note');
    if(!ta){ return pos; }
    const val = ta.value || "";
    const scrollable = ta.scrollHeight - ta.clientHeight;
    if(scrollable > 0){
        pos.ratio = ta.scrollTop / scrollable;
    }
    let idx = -1;
    if(ta.selectionStart != null && val.length > 0){
        // 光标位置与可视区中心的内容占比接近时，视为光标在可视区内
        const caret_frac = ta.selectionStart / val.length;
        const view_frac = (ta.scrollTop + ta.clientHeight / 2) / ta.scrollHeight;
        if(Math.abs(caret_frac - view_frac) < 0.12){
            idx = ta.selectionStart;
        }
    }
    if(idx < 0 && ta.scrollTop > 0 && val.length > 0){
        idx = Math.round(pos.ratio * val.length);
    }
    if(idx >= 0){
        pos.anchor = TextAnchorAt(val, idx);
    }
    return pos;
}
// 在md源文本中查找锚点位置：渲染文本与源码可能存在内联语法差异（如**加粗**），
// 逐级缩短前缀重试（前缀去尾随空格，兼容中文等无空格语言）；并优先在滚动比例
// 预估位置附近查找，降低重复段落误匹配
function FindMdAnchorIndex(md, anchor, est){
    const a = String(anchor || "").trim();
    if(a.length < 3){ return -1; }
    const lens = [30, 20, 12, 8, 5, 3];
    for(const len of lens){
        if(len > a.length){ continue; }
        const pre = a.substring(0, len).trim();
        if(pre.length < 2){ continue; }
        if(est != null){
            const i = md.indexOf(pre, Math.max(0, est - 2500));
            if(i >= 0 && i <= est + 2500){ return i; }
        }
        const j = md.indexOf(pre);
        if(j >= 0){ return j; }
    }
    return -1;
}
// 获取md编辑器内当前选区所在的块级元素（段落/标题/列表项/单元格/代码行）
function MdSelBlockEl(root){
    try{
        const s = window.getSelection();
        if(!s || !s.anchorNode || !root.contains(s.anchorNode)){ return null; }
        let el = s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode;
        while(el && el !== root){
            const tag = el.tagName ? el.tagName.toLowerCase() : '';
            const cls = (typeof el.className === 'string') ? el.className : '';
            if(tag === 'p' || /^h[1-6]$/.test(tag) || tag === 'li' || tag === 'td' || tag === 'th'
                || cls.indexOf('cm-line') >= 0 || cls.indexOf('cm-content') >= 0 || cls.indexOf('ProseMirror') >= 0){
                return el.classList.contains('ProseMirror') ? null : el;
            }
            el = el.parentElement;
        }
    }catch(e){}
    return null;
}
// 取md编辑器可视区顶部的首个内容块（与目录高亮判定线一致：视口顶部下方40px）
function MdViewTopBlockEl(root, pm){
    const line = root.getBoundingClientRect().top + 40;
    for(const c of pm.children){
        const cr = c.getBoundingClientRect();
        if(cr.height > 0 && cr.bottom > line){ return c; }
    }
    return null;
}
// 捕获md编辑器当前位置：光标所在块（需在可视区内）或可视区顶部块的文本锚点 + 滚动比例
function CaptureMdPos(){
    const pos = { anchor: "", ratio: 0 };
    const root = document.getElementById('md-editor');
    if(!root){ return pos; }
    if(root.scrollHeight > root.clientHeight){
        pos.ratio = root.scrollTop / (root.scrollHeight - root.clientHeight);
    }
    const pm = root.querySelector('.ProseMirror');
    if(!pm){ return pos; }
    let el = MdSelBlockEl(root);
    if(el){
        // 光标块不在可视区时改用可视区顶部块，保证跳转的是正在查看的位置
        const r = el.getBoundingClientRect(), rr = root.getBoundingClientRect();
        if(r.bottom <= rr.top + 40 || r.top >= rr.bottom - 40){ el = null; }
    }
    if(!el){ el = MdViewTopBlockEl(root, pm); }
    if(el && el.textContent){
        pos.anchor = el.textContent.trim().replace(/\s+/g, ' ').substring(0, 40);
    }
    return pos;
}
// 切回文本模式后，恢复到md编辑器对应位置（锚点行首定位光标，失败时按滚动比例）
function RestoreTextPos(pos){
    if(!pos){ return; }
    const ta = document.getElementById('last-note');
    if(!ta){ return; }
    const val = ta.value || "";
    const est = pos.ratio > 0 ? Math.round(pos.ratio * val.length) : null;
    let idx = FindMdAnchorIndex(val, pos.anchor, est);
    if(idx >= 0){
        idx = val.lastIndexOf('\n', idx) + 1; // 对齐到锚点所在行行首
        ta.focus();
        try{ ta.setSelectionRange(idx, idx); }catch(e){}
        MyScroll.ToTextareaPosition('#last-note', idx);
    }else if(pos.ratio > 0 && ta.scrollHeight > ta.clientHeight){
        ta.scrollTop = Math.round(pos.ratio * (ta.scrollHeight - ta.clientHeight));
    }
    // 程序设置scrollTop不触发scroll事件，手动同步行号列
    $(ta).trigger('scroll');
}
// 切到md模式后，恢复到文本编辑器对应位置（锚点所在块滚动到顶部，失败时按滚动比例）
function RestoreMdPos(pos){
    const root = document.getElementById('md-editor');
    if(!pos || !root){ return; }
    const pm = root.querySelector('.ProseMirror');
    if(pos.anchor && pm){
        const key = MdPosNormalize(pos.anchor).substring(0, 12);
        if(key.length >= 2){
            for(const el of pm.children){
                if(!el.textContent){ continue; }
                if(MdPosNormalize(el.textContent).indexOf(key) >= 0){
                    el.scrollIntoView({ behavior: 'auto', block: 'start' });
                    return;
                }
            }
        }
    }
    if(pos.ratio > 0 && root.scrollHeight > root.clientHeight){
        root.scrollTop = Math.round(pos.ratio * (root.scrollHeight - root.clientHeight));
    }
}

// milkdown.min.js 在 index.html 中同步加载，md模式下可立即使用
// restore：位置恢复参数。传CaptureTextPos()结果表示切到md后恢复到文本对应位置；
// 传'self'表示重建场景（窗口调整等）自动保持当前md编辑器位置；不传则不恢复（内容已变化）
function ShowMdEditor(restore){
    if(restore === 'self'){
        restore = (md_editor_state.shown && md_editor_state.crepe) ? CaptureMdPos() : null;
    }
    let mdDiv = $("#md-editor");
    // 显示md编辑器，隐藏 last-note 包裹容器（含行号）
    $(".last-note-wrapper").hide();
    mdDiv.show();
    // 显示左侧目录，top 对齐当前可见导航栏下方
    $("#md-toc").css('top', GetNavTabsHeight() + 'px').show();
    MdToc.update($("#last-note").val());
    $("#md-mode-btn").addClass('active');
    $("#file-md-mode-btn").addClass('active').attr('title', '切换为文本模式');
    // 设置编辑器高度后重建 Crepe（所见即所得），数据源为 #last-note
    mdDiv.css('height', GetEditorHeight() + 'px');
    md_editor_state.shown = true;
    if(md_editor_state.crepe){
        try{ md_editor_state.crepe.destroy(); }catch(e){}
        md_editor_state.crepe = null;
    }
    md_editor_state.crepe = new MilkdownCrepe({
        root: mdDiv[0],
        defaultValue: $("#last-note").val(),
        features: {
            [MilkdownCrepe.Feature.AI]: false,
            [MilkdownCrepe.Feature.Toolbar]: true,
            [MilkdownCrepe.Feature.CodeMirror]: true,
            [MilkdownCrepe.Feature.Table]: true,
        },
    });
    let crepe = md_editor_state.crepe;
    // 编辑内容变化时同步回 #last-note，驱动 edit-flag 等原有逻辑
    md_editor_state.crepe.on((listener)=>{
        listener.markdownUpdated((_, md)=>{
            $("#last-note").val(md);
            MdToc.update(md);
            TriggerNoteInput();
        });
    });
    md_editor_state.crepe.create().then(()=>{
        TriggerNoteInput();
        if(restore && md_editor_state.crepe === crepe){
            // 等待一帧确保布局完成后，恢复到切换前文本编辑器的对应位置
            requestAnimationFrame(function(){ RestoreMdPos(restore); });
        }
    });
}
function HideMdEditor(update_last_note = true){
    let mdDiv = $("#md-editor");
    // 隐藏md编辑器，显示 last-note 包裹容器（含行号）
    $(".last-note-wrapper").show();
    mdDiv.hide();
    $("#md-toc").hide();
    md_editor_state.shown = false;
    $("#md-mode-btn").removeClass('active');
    $("#file-md-mode-btn").removeClass('active').attr('title', 'markdown编辑器');
    // 更新last-note为md编辑器的内容
    if(update_last_note && md_editor_state.crepe){
        try{ $("#last-note").val(md_editor_state.crepe.getMarkdown()); }catch(e){}
        TriggerNoteInput();
    }
    // 释放 Crepe 实例
    if(md_editor_state.crepe){
        try{ md_editor_state.crepe.destroy(); }catch(e){}
        md_editor_state.crepe = null;
    }
    // 切回文本模式后同步行号列（md模式期间的变更需反映到行号）
    UpdateLastNoteGutter($("#last-note").val());
}
function SwitchMdEditor(){
    if(md_editor_state.shown){
        // 切换前捕获md编辑器位置，切回文本模式后恢复到对应位置
        let pos = CaptureMdPos();
        HideMdEditor();
        RestoreTextPos(pos);
    }else{
        // 切换前捕获文本编辑器位置，切到md模式后恢复到对应位置
        ShowMdEditor(CaptureTextPos());
    }
    // 文件模式下记录当前文件的编辑器模式，切换文件时恢复
    let f = CurFile();
    if(f){ f.md_shown = md_editor_state.shown; }
};

// ==================================================== 本地文件编辑模式（只支持md文件） ====================================================
function CurFile(){
    return file_data.files[file_data.cur_index] || null;
}

function GetFileName(path){
    let idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return idx >= 0 ? path.substring(idx + 1) : path;
}

// 同步当前文件编辑中的内容到working缓存
function SyncCurFileWorking(){
    let f = CurFile();
    if(f){ f.working = GetCurModifyNoteContent(); }
}

// 检查是否存在未保存的本地文件
function HasUnsavedFiles(){
    SyncCurFileWorking();
    return file_data.files.some(f => f.working != f.content);
}

// 请求后台弹出文件选择对话框
function OpenLocalFileDialog(){
    CallSys('open-file-dialog');
}

function DoOpenFiles(paths){
    for(let p of paths){
        CallSys('read-local-file', {path: p});
    }
}

// 后台读取完成后添加文件（已打开则直接切换）
function AddLocalFile(path, content){
    // 换行统一为\n，避免md编辑器与diff比较时出现CRLF差异
    content = String(content).replace(/\r\n/g, '\n');
    let exist = file_data.files.findIndex(f => f.path === path);
    if(exist >= 0){
        SwitchToFile(exist);
        Info("文件已打开，切换到《" + file_data.files[exist].name + "》");
        return;
    }
    let f = {
        path: path,
        name: GetFileName(path),
        content: content,
        working: content,
        md_shown: true,    // md文件默认使用md编辑器
    };
    file_data.files.push(f);
    let first_enter = !file_data.mode;
    if(first_enter){
        file_data.mode = true;
        ApplyFileModeUI();
    }
    SwitchToFile(file_data.files.length - 1);
    ShowBoard('#last-note-board');
    Info("已打开《" + f.name + "》");
}

// 切换到指定文件（tab点击/新打开文件）
function SwitchToFile(index){
    if(index == file_data.cur_index && CurFile()){ return; }
    // 保存当前文件的编辑状态
    let cur = CurFile();
    if(cur){
        cur.working = GetCurModifyNoteContent();
        cur.md_shown = md_editor_state.shown;
    }
    file_data.cur_index = index;
    let f = file_data.files[index];
    $("#last-note").val(f.working);
    // 文件内容使用等宽字体（文本模式下md源码更易读）
    $("#last-note").addClass('equal-width-font');
    UpdateLastNoteGutter(f.working);
    $("#last-note").scrollTop(0);
    if(f.md_shown){
        ShowMdEditor();
    }else if(md_editor_state.shown){
        HideMdEditor(false);
    }
    $("#last-note").trigger('scroll');
    TriggerNoteInput();
    RenderFileTabs();
    // 窗口标题以当前文件名开头，便于区分多个进程窗口
    CallSys('set-window-title', f.name + " - Snippet Notes");
    Info("已切换到《" + f.name + "》");
}

// 关闭指定文件（tab关闭按钮）
function CloseFile(index){
    let f = file_data.files[index];
    if(!f) return;
    if(index == file_data.cur_index){
        f.working = GetCurModifyNoteContent();
    }
    let do_close = ()=>{
        file_data.files.splice(index, 1);
        if(file_data.files.length == 0){
            // 所有文件已关闭，自动返回笔记模式
            DoExitFileMode();
            return;
        }
        if(index == file_data.cur_index){
            // 关闭的是当前文件，激活相邻文件
            file_data.cur_index = -1;
            SwitchToFile(Math.min(index, file_data.files.length - 1));
        }else{
            if(index < file_data.cur_index){ file_data.cur_index -= 1; }
            RenderFileTabs();
        }
        Info("已关闭《" + f.name + "》");
    };
    if(f.working != f.content){
        MyModal.Confirm("文件《" + f.name + "》尚未保存，是否保存后关闭 ？", function(){
            $("#my-confirm").modal('hide');
            CallSys('save-local-file', {path: f.path, content: f.working});
            do_close();
        }, function(){
            Info("已取消关闭");
        }, { text:"丢弃变更", fun:function(){
            $("#my-confirm").modal('hide');
            do_close();
        }}, "文件已被修改", 600, 100);
    }else{
        do_close();
    }
}

// 关闭全部文件后返回笔记模式（关闭文件逻辑内部调用）
function DoExitFileMode(){
    let had_md = md_editor_state.shown;
    file_data.files = [];
    file_data.cur_index = -1;
    file_data.mode = false;
    if(had_md){ HideMdEditor(false); }
    if(note_data.last_note.name === undefined){
        // 带文件启动的进程从未加载过笔记，返回笔记模式时才首次加载
        CallSys('get-last-note');
    }else{
        // 恢复笔记编辑界面
        UpdateLastNote(note_data.last_note);
        // UpdateLastNote的后续更新分支不会恢复md模式，这里按笔记标题手动恢复
        if(!md_editor_state.shown && note_data.last_note.name[0] == '#'){
            ShowMdEditor();
        }
    }
    ApplyFileModeUI();
    RenderFileTabs();
    // 恢复默认窗口标题
    CallSys('set-window-title', "Snippet Notes");
    Info("已返回笔记模式");
}

// 保存当前本地文件
function SaveCurLocalFile(){
    let f = CurFile();
    if(!f) return;
    let content = GetCurModifyNoteContent();
    if(content == f.content){
        Info("数据未修改，无需保存");
        return;
    }
    Info('开始保存 ...');
    CallSys('save-local-file', {path: f.path, content: content});
}

// 保存所有有修改的本地文件（退出/返回前）
function SaveAllModifiedFiles(){
    SyncCurFileWorking();
    for(let f of file_data.files){
        if(f.working != f.content){
            CallSys('save-local-file', {path: f.path, content: f.working});
        }
    }
}

// 渲染文件tabs
function RenderFileTabs(){
    // tab插入到第一个静态按钮之前（打开按钮已移至最后）
    let anchor_li = $("#file-nav-tabs").children("li:not(.file-tab)").first();
    $(".file-tab").remove();
    for(let i = 0; i < file_data.files.length; i++){
        let f = file_data.files[i];
        let li = $("<li class='file-tab'></li>");
        if(i == file_data.cur_index){ li.addClass("active"); }
        let a = $("<a class='top-nav'></a>").attr("title", f.path);
        a.append($("<span class='file-tab-name'></span>").text(f.name));
        if(f.working != f.content){
            a.append($("<span class='file-tab-flag'></span>").text(" *"));
        }
        let close_btn = $("<span class='file-tab-close glyphicon glyphicon-remove' title='关闭文件'></span>");
        close_btn.click(function(e){
            e.stopPropagation();
            CloseFile(i);
        });
        a.append(close_btn);
        a.click(function(){
            SwitchToFile(i);
        });
        li.append(a);
        anchor_li.before(li);
    }
}

// 文件模式与笔记模式的界面元素切换
function ApplyFileModeUI(){
    if(file_data.mode){
        $("#note-nav-tabs").hide();
        $(".note-only").hide();
        $("#file-nav-tabs").show();
    }else{
        $("#note-nav-tabs").show();
        $(".note-only").show();
        $("#file-nav-tabs").hide();
    }
    InitSize();
}
// 拷贝文字到剪贴板，支持多行文本
function CopyText(text){
    if(navigator.clipboard){
        navigator.clipboard.writeText(text).then(function() {
            MyModal.Alert("已拷贝"+text.length+"字符到剪贴板");
        }, function() {
            MyModal.Alert("拷贝失败");
        });
        return;
    }else{
        // 效果不稳定，有时候会拷贝失败
        // 创建一个textarea元素
        var textarea = document.createElement('textarea');
        // 设置textarea的内容为需要拷贝的文本内容
        textarea.value = text;
        // 将textarea元素添加到body中
        document.body.appendChild(textarea);
        // 选中textarea中的文本
        textarea.select();
        // 执行拷贝操作
        if(document.execCommand('copy')){
            MyModal.Alert("已拷贝"+text.length+"字符到剪贴板");
        }else{
            MyModal.Alert("拷贝失败");
        }
        // 将textarea元素从body中移除
        document.body.removeChild(textarea)
    }
}


$(function(){
    // 从后台获取初始数据，并初始化界面
    CallSys('get-last-note')

    // #search-param-content的checkbox选中时设置toggle背景色
    $("#search-param-content input[type='checkbox']").change(function(){
        // 有任何一个checkbox被选中时设置边框橘色发光
        if($("#search-param-content input[type='checkbox']:checked").length > 0){
            $("#search-param-toggle").css("background-color", "#f7f7f7");
        }else{
            $("#search-param-toggle").css('background-color', '');
        }
    });

    $("#search-param-toggle").click(()=>{
        // 切换 #search-param-content 的显示状态
        $("#search-param-content").toggle();
    });
    // 当不在#search-param-content区域时隐藏
    $("#search-param-content").hover(()=>{}, ()=>{
        $("#search-param-content").hide();
    });

    $("#search-btn").click(()=>{
        if($("#search-input").val().length < 1){
            Info("搜索内容不能为空");
        }else{
            Info("开始搜索 ...");
            CallSys('search', { 
                key:$("#search-input").val(), 
                cur_note_flag:$("#search-cur-page").prop("checked"), 
                use_reg:$("#search-use-reg").prop("checked"), 
                id:note_data.last_note.id
            });
        }
    });

    /* if  input enter then call #search-btn click */
    $('#search-input').bind('keyup', function(event) {
        if (event.keyCode == '13') {
            var input = $(event.target);
            //处理按回车键后的逻辑
            if(input.val() != ""){
                $("#search-btn").click();
            }else{
                // 搜索字符串为空时展示编辑界面
                ShowBoard('#last-note-board');
            }
        }
    });
    // 点击时自动选中搜索框
    $('#search-input').focus((e)=>{
        let input = $(e.target);
        if(input.val() != ""){
            input.select();
        }
    });

    // 快捷键
    $('body').bind('keydown', function(event) {
        if((event.ctrlKey || event.metaKey)){
            if(event.keyCode == 83){
                // ctrl + s 保存
                if(file_data.mode){
                    SaveCurLocalFile();
                }else{
                    SaveAndUpdateNote();
                }
            }else if(event.keyCode == 70){
                // ctrl + f 搜索（文件模式下搜索区已隐藏，不处理）
                if(!file_data.mode){
                    $("#search-input").focus();
                }
            }else if(event.keyCode == 72){
                // ctrl + h 替换
                if(file_data.mode){
                    $("#file-replace-btn").click();
                }else{
                    $("#note-replace-btn").click();
                }
            }
        }
    });
    // 快捷键

    // TODO: test
    //ShowBoard("#res-detail-board");

    $("#search-close-btn").click(function(){
        ShowBoard('#last-note-board');
    });

    $("#search-detail-close-btn").click(function(){
        ShowBoard('#search-res-board');
    });

    $("#search-detail-edit-btn").click(function(){
        EditSearchDetail($('#res-detail').attr('nid'), $("#res-detail").attr("range"));
    });

    $("#res-detail").dblclick(function(e) {
        EditSearchDetail($('#res-detail').attr('nid'), $("#res-detail").attr("range"));
    });

    $("#search-detail-home-btn").click(()=>{
        ShowBoard('#last-note-board');
    });

    // 处理默认笔记标题中的家图标点击事件
    $("#default-note-title-btn").click(function(){
        // 请求后台获取默认笔记ID
        CallSys('show-default-note', null);
    });

    $("#add-note-btn").click(()=>{
        if(IsLastModify()){
            MyModal.Alert("笔记已被修改，请先保存");
            return;
        }

        UpdateLastNote({id:-1, name:"新笔记", content:""});
    });

    $('#diff-note-btn').click(()=>{
        if(!IsLastModify()){
            MyModal.Alert('没有变更');
            return;
        }
        ShowDiff(note_data.last_note.content, GetCurModifyNoteContent());
    });

    $("#md-mode-btn").click(()=>{
        SwitchMdEditor();
    });

    $("#last-note").on('input', MyTimer.Debounce(()=>{
        var cur = $("#last-note").val();
        // 文本模式下内容变化时同步行号列（md模式下编辑区隐藏，行号不可见无需更新）
        if(!md_editor_state.shown){
            UpdateLastNoteGutter(cur);
        }
        if(file_data.mode){
            // 文件模式：同步working缓存并更新tab上的修改标记
            let f = CurFile();
            if(f){
                f.working = cur;
                RenderFileTabs();
            }
        }else if(IsLastModify()){
            $("#edit-flag").addClass('visible');
        }else{
            $("#edit-flag").removeClass('visible');
        }
    }, 200));

    // 文本滚动时同步行号滚动
    $("#last-note").on('scroll', function(){
        var gt = $("#last-note-gutter");
        gt.scrollTop($(this).scrollTop());
    });

    $("#last-note").keydown(function(e){
        // 笔记编辑特殊处理
        // last-note输入tab键时对选择的文本进行缩进处理
        if(e.keyCode == 9){
            if(e.shiftKey){
                // shift + tab时取消缩进
                e.preventDefault();
                var start = this.selectionStart;
                var end = this.selectionEnd;
                var selected = window.getSelection().toString();
                let indentedText = selected.split('\n').map(line => {
                    if (line.length >= 4 && line.substring(0, 4) == '    '){
                        return line.substring(4);
                    }else{
                        return line;
                    }
                }).join('\n');  
                var $this = $(this);
                var pre_value = $this.val();
                $this.val(pre_value.substring(0, start) + indentedText + pre_value.substring(end));
                // 重新设置选择的文本位置
                this.selectionStart = start;
                this.selectionEnd = start + indentedText.length;
            }else{
                // tab时缩进
                e.preventDefault();
                var start = this.selectionStart;
                var end = this.selectionEnd;
                var $this = $(this);
                var pre_value = $this.val();
                if(start == end){
                    // 没有选择文本时直接插入4个空格
                    $this.val(pre_value.substring(0, start) + '    ' + pre_value.substring(end));
                    // 重新设置选择的文本位置
                    this.selectionStart = start + 4;
                    this.selectionEnd = start + 4;
                }else{
                    var selected = window.getSelection().toString();
                    let indentedText = selected.split('\n').map(line => {
                        if (line.length > 0){
                            return '    ' + line;
                        }else{
                            return line;
                        }
                    }).join('\n');  
                    $this.val(pre_value.substring(0, start) + indentedText + pre_value.substring(end));
                    // 重新设置选择的文本位置
                    this.selectionStart = start;
                    this.selectionEnd = start + indentedText.length;
                }
            }
            // 触发input事件
            $(this).trigger('input');
        }
    });


    $("#note-his-btn").click(function(){
        CallSys("get_history_notes", note_data.last_note.id);
    });

    // 编辑器内容查找并替换（笔记与本地文件共用）
    function ShowReplaceDialog(){
        // 弹框输入替换内容
        // 生成替换的原始值及目标值输入框的html代码
        var replace_html=`
        <div class="form-group">
            <input type="text" class="form-control" id="noteeditor-replace-from" placeholder="原始值(正则表达式)">
        </div>
        <div class="form-group">
            <input type="text" class="form-control" id="noteeditor-replace-to" placeholder="目标值">
        </div>
        `
        MyModal.Alert(replace_html, function(){
            if($("#noteeditor-replace-from").length < 1 || $("#noteeditor-replace-to").length < 1){
                Info("替换内容不能为空");
                return;
            }
            var from_reg = new RegExp($("#noteeditor-replace-from").val(), 'g');
            var to_str = $("#noteeditor-replace-to").val();
            // 替换当前编辑器内容（md模式取md编辑器内容）
            var new_str = GetCurModifyNoteContent().replace(from_reg, to_str);
            $("#last-note").val(new_str);
            if(md_editor_state.shown){
                // 重建Crepe以反映替换结果
                ShowMdEditor();
            }
            // 替换后触发last note input事件
            TriggerNoteInput();
        }, 600, 120, "请输入查找并替换内容");
        // 设置500ms延时后自动聚焦，留出渲染时间
        setTimeout(()=>{
            $("#noteeditor-replace-from").focus();
        }, 500);
    }

    $("#note-replace-btn").click(function(){
        ShowReplaceDialog();
    });

    $("#file-replace-btn").click(function(){
        if(!CurFile()){
            MyModal.Alert("没有打开的文件");
            return;
        }
        ShowReplaceDialog();
    });

    // 打开本地md文件
    $("#open-file-btn").click(function(){
        OpenLocalFileDialog();
    });

    $("#file-open-btn").click(function(){
        OpenLocalFileDialog();
    });

    // 新建本地md文件
    $("#file-new-btn").click(function(){
        CallSys('new-file-dialog', '');
    });

    // 本地文件查看变更
    $("#file-diff-btn").click(function(){
        let f = CurFile();
        if(!f) return;
        let cur = GetCurModifyNoteContent();
        if(cur == f.content){
            MyModal.Alert('没有变更');
            return;
        }
        ShowDiff(f.content, cur, '文件变更: ' + f.name);
    });

    // 本地文件md/文本模式切换
    $("#file-md-mode-btn").click(function(){
        SwitchMdEditor();
    });

    $("#last-note-title-btn").click(function(){
        // 点击标题时显示选择笔记界面
        CallSys("get_all_note_names");
    });
    
});

 // 当窗口大小变化时的操作
var _resizeRafId = null;
$(window).resize(function(){
    InitSize();
    if(_resizeRafId) cancelAnimationFrame(_resizeRafId);
    _resizeRafId = requestAnimationFrame(function(){
        UpdateLastNoteGutter($("#last-note").val());
        _resizeRafId = null;
    });
});