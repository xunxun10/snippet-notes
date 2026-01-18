/// <reference path="./util/my_util.js" />

// 页面渲染逻辑

let note_data = { last_note_range:null, last_note:{}, first_open:true };
// 缓存上一次 gutter 的行文本，用于增量更新
let _lastNoteGutterPrevLines = [];

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
                SaveAndUpdateNote();
            },
            "update-note-detail":function(v){
                UpdateDetail(v.name, v.id, v.content);
            },
            "check-modify-before-close":function(v){
                if(IsLastModify()){
                    MyModal.Confirm("是否丢弃修改,直接退出 ？", function(){
                        CallSys("close-app");
                    }, function(){
                        Info("请先保存修改再退出");
                    }, null, "笔记内容已被修改", 600, 100);
                }else{
                    CallSys("close-app");
                }
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

    console.debug("send to sys: " + type + ' ' + JSON.stringify(msg).substring(0, 100))

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
        CallSys("save_and_up_note", {note:{
            id:note_data.last_note.id,
            name:GetTitle(content),
            content:content,
        }, new_note_id:new_id});
    }else{
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

    // 同步左侧行号列
    UpdateLastNoteGutter(v.content);

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
            if(vditor.shown){
                // 由于md中的文本有可能被自动格式化，因此不能更新到#last-note
                HideMdEditor(false);
            }
            InitSize();
        }
    }else{
        // 软件已打开，只是更新数据时的逻辑
        // 如果是md模式则更新md编辑器
        if(vditor.shown){
            vditor.obj.setValue(v.content);
        }
    }

    if(v.name[0] == '#'){
        // 设置字体为等宽字体
        last_note_ele.addClass('equal-width-font');
    }else{
        // 设置字体为默认字体
        last_note_ele.removeClass('equal-width-font');
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
            last_note_ele.animate({scrollTop: last_note_ele.prop("scrollHeight") + 'px'}, 200);
            note_data.first_open = false;
        }
    }

    $("#edit-flag").hide();
    Info("已重新加载《" + v.name + "》");
}

// 更新左侧行号列（从0开始计数），保持与文本内容行数同步
function UpdateLastNoteGutter(content){
    var gutter = document.getElementById('last-note-gutter');
    if(!gutter) return;
    // 按换行符分割，保留末尾空行
    var lines = content === undefined || content === null ? [''] : content.split('\n');

    // 增量更新策略：找到前缀相同的行索引，只对从 firstDiff 开始的行进行添加/更新/删除
    var prev = _lastNoteGutterPrevLines || [];
    var prevLen = prev.length;
    var newLen = lines.length;
    var minLen = Math.min(prevLen, newLen);
    var firstDiff = 0;
    while(firstDiff < minLen && prev[firstDiff] === lines[firstDiff]){
        firstDiff++;
    }

    // 如果 gutter 为空或首次渲染，直接生成剩余节点
    // 保证 gutter.childNodes 的数量至少为 firstDiff
    // 更新或创建从 firstDiff 到 newLen-1 的行号节点
    for(var i = firstDiff; i < newLen; i++){
        if(i < gutter.childNodes.length){
            // 更新已有节点文本（行号即索引）
            gutter.childNodes[i].textContent = String(i);
        }else{
            // 创建新节点并追加
            var ln = document.createElement('div');
            ln.className = 'gutter-line';
            ln.appendChild(document.createTextNode(i));
            gutter.appendChild(ln);
        }
    }

    // 如果新长度比之前短，移除多余的节点
    if(newLen < gutter.childNodes.length){
        for(var j = gutter.childNodes.length - 1; j >= newLen; j--){
            gutter.removeChild(gutter.childNodes[j]);
        }
    }

    // 更新缓存的 lines（保留副本）
    _lastNoteGutterPrevLines = lines.slice(0);

    // 自动计算并设置 gutter 宽度，依据最大行号位数
    try{
        var maxIndex = Math.max(0, newLen - 1);
        var digits = String(maxIndex).length;
        // 每位大约 8px，再加 padding；限制最小/最大宽度
        var w = Math.min(140, Math.max(20, digits * 7 + 12));
        gutter.style.width = w + 'px';
    }catch(e){
        // ignore
    }
}

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
    if (vditor.shown){
        try {
            return vditor.obj.getValue();
        } catch (error) {
            //ShowError("get vditor error, " + error);
            return $("#last-note").val();
        }
    }else{
        return $("#last-note").val();
    }
}

function IsLastModify(){
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
    $(".board").css('height', ($(window).height() - 90) + 'px');
    $("#res-detail").css('max-height', ($(window).height() - 120) + 'px');
    // 如果为md编辑器模式则修改md编辑器的大小
    if(vditor.shown){
        let pre_text = GetCurModifyNoteContent();
        vditor.obj = null;
        ShowMdEditor();
        setTimeout(()=>{
            vditor.obj.setValue(pre_text)
        }, 500);
    }
}

// 触发last-note input事件，以设置edit-flag的显示状态等
function TriggerNoteInput(){
    // 设置1秒定时器，防止频繁触发input事件
    MyTimer.Debounce(()=>{
        $("#last-note").trigger('input');
    }, 500, 'triggrt-input')();
}

let vditor = { shown: false, obj: null};
function ShowMdEditor(){
    let md_editor = $("#md-editor");
    // 显示md编辑器，隐藏 last-note 包裹容器（含行号）
    $(".last-note-wrapper").hide();
    md_editor.show();
    $("#md-mode-btn").css('background-color', '#eee');

    // 使用 vditor 进行 markdown 编辑，展示在 #md-editor 中 
    if (vditor.obj){
        vditor.obj.setValue($("#last-note").val());
    }else{
        vditor.obj = new Vditor('md-editor', {
            "height": $("#last-note").height() - 60,
            "cache": {
                "enable": false
            },
            "cdn": "./lib/vditor",
            "value": $("#last-note").val(),
            "mode": "ir",  // 即时渲染模式（ir），所见即所得模式（wysiwyg）,分屏预览（sv）
            "toolbar":[
                // 取消 "upload", "record", "export"
                "emoji", "headings", "bold", "italic", "strike", "link", "|", "list", "ordered-list", "check", "outdent", "indent", "|", "quote", "line", "code", "inline-code", "insert-before", "insert-after", "|", "table", "|", "undo", "redo", "|", "fullscreen", "edit-mode",
                {
                    name: "more",
                    toolbar: ["both", "code-theme", "content-theme", "outline", "preview", "devtools", "info", "help",],
                },
            ],
            "input": function (value, previewElement) {
                // 触发last-note input事件
                $("#last-note").trigger('input');
            },
            "outline": {enable:true}, // 默认显示大纲
        })
    }
    vditor.shown = true;
    TriggerNoteInput();
}
function HideMdEditor(update_last_note = true){
    let md_editor = $("#md-editor");
    // 隐藏md编辑器，显示 last-note 包裹容器（含行号）
    $(".last-note-wrapper").show();
    md_editor.hide();
    vditor.shown = false;
    $("#md-mode-btn").css('background-color', '');
    // 更新last-note为md编辑器的内容
    if(update_last_note && vditor.obj){
        $("#last-note").val(vditor.obj.getValue());
        TriggerNoteInput();
    }
}
function SwitchMdEditor(){
    if(vditor.shown){
        // 隐藏md编辑器
        HideMdEditor();
    }else{
        ShowMdEditor();
    }
};
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
                SaveAndUpdateNote();
            }else if(event.keyCode == 70){
                // ctrl + f 搜索
                $("#search-input").focus();
            }else if(event.keyCode == 72){
                // ctrl + h 替换
                $("#note-replace-btn").click();
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
        // 更新行号
        UpdateLastNoteGutter(cur);
        if(IsLastModify()){
            $("#edit-flag").show();
            $("#diff-note-btn").removeClass('disabled');
        }else{
            $("#edit-flag").hide();
            $("#diff-note-btn").addClass('disabled');
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

    // 编辑器内容替换
    $("#note-replace-btn").click(function(){
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
            // 替换编辑框，如果是md模式则替换md编辑器的内容
            if(vditor.shown){
                var new_str = vditor.obj.getValue().replace(from_reg, to_str);
                vditor.obj.setValue(new_str);
                // $("#last-note").val(new_str);  
            }else{
                $("#last-note").val($("#last-note").val().replace(from_reg, to_str));
            }
            // 替换后触发last note input事件
            TriggerNoteInput();
        }, 600, 120, "请输入查找并替换内容");
        // 设置500ms延时后自动聚焦，留出渲染时间
        setTimeout(()=>{
            $("#noteeditor-replace-from").focus();
        }, 500);
    });

    $("#last-note-title-btn").click(function(){
        // 点击标题时显示选择笔记界面
        CallSys("get_all_note_names");
    });
    
});

$(window).resize(function(){
    InitSize();
});