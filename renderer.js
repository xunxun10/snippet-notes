// 页面渲染逻辑

let note_data = { last_note_range:null, last_note:{}, first_open:true };

// 监听后台发来的事件
if(typeof window.electronAPI != 'undefined'){
    window.electronAPI.OnBgErrorMsg((_event, value) => {
        MyModal.Alert("Error: " + value);
    })
    window.electronAPI.OnSysCall((_event, msg) => {
        let value = msg.data;
    
        console.debug("handle from sys: " + msg.type + ' ' + JSON.stringify(value).substring(0, 100))
    
        var ProcessSysCall = {
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
                MyModal.Alert("<div class='ModalInfoDiv'>" + value + "</div>");
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
                    });
                }else{
                    CallSys("close-app");
                }
            },
            'show-all-note-names':function(note_names){
                let note_dir = $("<div></div>");
                for (var i=0; i<note_names.length; i++) {
                    note_dir.append("<button class='dir-to-note-btn' nid='"+note_names[i]['id']+"'>"+note_names[i]['name'].substr(0, 30)+"</button>");
                }
                var modal = MyModal.Info(note_dir, "所有笔记");
                $(".dir-to-note-btn").click(function(){
                    modal.modal("hide");
                    EditSearchDetail($(this).attr("nid"));
                    note_data.first_open = true;
                });
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

function UpdateLastNote(v){
    // 数据更新必须放在最前面，否则md编辑器打开会报异常
    note_data.last_note = v;
    var last_note_ele = $("#last-note");
    $("#last-note-title").text(v.name);
    last_note_ele.val(v.content)

    // 如果是md模式则更新md编辑器
    if(vditor.shown){
        vditor.obj.setValue(v.content);
    }

    // 根据文件标题自动确定编辑器类型
    if(note_data.first_open){
        // 如果是md模式则更新md编辑器
        if(vditor.shown){
            // 文件加载或切换时如果当前标题不以#开头则切换到非md模式
            if(v.name[0] != '#'){
                // 由于md中的文本有可能被自动格式化，因此不能更新到#last-note
                HideMdEditor(false);
            }
        }else{
            // 文件加载或切换时如果当前标题以#开头则切换到md模式
            if(v.name[0] == '#'){
                ShowMdEditor();
            }
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
            last_note_ele.animate({scrollTop: last_note_ele.prop("scrollHeight") + 'px'}, 500);
            note_data.first_open = false;
        }
    }

    $("#edit-flag").hide();
    Info("已重新加载《" + v.name + "》");
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
            ShowError("get vditor error, " + error);
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
    if(IsLastModify()){
        MyModal.Confirm("笔记内容本地变更尚未保存，是否保存后跳转（不保存将取消跳转动作） ？", function(){
            // 保存last note并拉取选中的笔记
            SaveAndUpdateNote(detail_id);

            if(range != null){
                note_data.last_note_range = range.split(',');
            }
        
            // 拉取最新的note进行编辑
            CallSys('get-last-note', detail_id)
        
            ShowBoard('#last-note-board');
        }, function(){
            Info("需要保存修改内容后才能进行新内容编辑，已取消进入新内容编辑");
        });
    }else{
        if(range != null){
            note_data.last_note_range = range.split(',');
        }
        
        // 拉取最新的note进行编辑
        CallSys('get-last-note', detail_id)
    
        ShowBoard('#last-note-board');
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

// 触发last-note input事件
function TriggerNoteInput(){
    // 设置1秒定时器，防止频繁触发input事件
    MyTimer.Debounce(()=>{
        $("#last-note").trigger('input');
    }, 1000, 'triggrt-input')();
}

let vditor = { shown: false, obj: null};
function ShowMdEditor(){
    let md_editor = $("#md-editor");
    // 显示md编辑器，隐藏last-note
    $("#last-note").hide();
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
    // 隐藏md编辑器
    $("#last-note").show();
    md_editor.hide();
    vditor.shown = false;
    $("#md-mode-btn").css('background-color', '');
    // 更新last-note为md编辑器的内容
    if(update_last_note){
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

$(function(){
    // 从后台获取初始数据
    CallSys('get-last-note')

    $("#search-btn").click(()=>{
        if($("#search-input").val().length < 1){
            Info("搜索内容不能为空");
        }else{
            Info("开始搜索 ...");
            CallSys('search', $("#search-input").val());
        }
    })

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
            }
        }
    });
    // 快捷键

    InitSize();

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

    $("#add-note-btn").click(()=>{
        if(IsLastModify()){
            MyModal.Alert("笔记已被修改，请先保存");
            return;
        }

        UpdateLastNote({id:-1, name:"新笔记", content:""});
    });

    $('#diff-note-btn').click(()=>{
        var color = '', span = null;
        var display = $("<pre id='diff-info'></pre>");
        var diff = Diff.diffChars(note_data.last_note.content, GetCurModifyNoteContent()),
            fragment = document.createDocumentFragment();
        
        if(!IsLastModify()){
            MyModal.Alert('没有变更');
            return;
        }

        diff.forEach(function(part){
            // green for additions, red for deletions, grey for common parts
            color = part.added ? 'green' : part.removed ? 'red' : '';
            span = document.createElement('span');
            if(color == ''){
                span.appendChild(document.createTextNode(part.value));
            }else{
                // 设置class
                span.className = 'diff-span ' + color;
                span.appendChild(document.createTextNode(part.value.replace(/[\t ]/g, '^s').replace(/\n/g, '^n\n')));
            }
            fragment.appendChild(span);
        });

        display.append(fragment);
        MyModal.Info(display, "note diff");

        // 设置跳转到上一个及下一个变更的位置的按钮
        var pre_btn = $("<button class='btn btn-default diff-pre-btn'><span class='glyphicon glyphicon-chevron-up'></span></button>");
        var next_btn = $("<button class='btn btn-default diff-next-btn'><span class='glyphicon glyphicon-chevron-down'></button>");
        cur_show_diff = null;
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
                    cur_show_diff = cur_span;
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
            // 倒序遍历#diff-info内的span元素
            $("#diff-info .diff-span").each(function(index, ele_dom){
                // 遍历#diff-info内的span元素，找到位于可视区域的前一个span元素
                var cur_span = $(ele_dom);
                // 相对于可视区域的位置
                var cur_span_top = cur_span.position().top;
                // cur_show_diff != cur_span_top 的判断有问题
                if(cur_span_top > 0){
                    if(cur_span_top < cur_span_parent.height() && cur_show_diff && cur_show_diff.is(cur_span)){
                        return; // continue
                    }
                    cur_span_parent.scrollTop(cur_span_parent_scroll_top + cur_span_top - 30);
                    cur_show_diff = cur_span;
                    find_flag = true;
                    return false;
                }
            });
            if(!find_flag){
                // 提示已无数据
                MyModal.Alert("已到底");
            }
        });
        display.append(pre_btn);
        display.append(next_btn);
    });

    $("#md-mode-btn").click(()=>{
        SwitchMdEditor();
    });

    $("#last-note").on('input', MyTimer.Debounce(()=>{
        if(IsLastModify()){
            $("#edit-flag").show();
            $("#diff-note-btn").removeClass('disabled');
        }else{
            $("#edit-flag").hide();
            $("#diff-note-btn").addClass('disabled');
        }
    }, 300));

    $("#last-note").keydown(function(e){   
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


    $("#dir-note-btn").click(function(){
        CallSys("get_all_note_names");
    });
    $("#last-note-title-btn").click(function(){
        // 点击标题时判断是否为markdown模式，是的话切换到编辑模式，否则显示所有笔记
        if(vditor.shown){
            SwitchMdEditor();
        }else{
            CallSys("get_all_note_names");
        }
    });
    
});

$(window).resize(function(){
    InitSize();
});