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
    let content = $("#last-note").val();
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

function ShwoResult(v){
    $("#search-res").empty();
    var keys = [];
    for (var i = 0; i <v.length; i++) {
        let new_item = $('<pre class="res-item"></pre>');
        new_item.text( v[i].str);
        new_item.attr('nid', v[i].id);
        new_item.attr('key', v[i].key);
        new_item.attr('range', v[i].range);
        let item_div = $('<fieldset class="snippet-item info-div"> <legend class="res-item-title">' + v[i].name + '</legend></fieldset>');
        item_div.append(new_item)
        $("#search-res").append(item_div);
        keys = v[i].key;
    }
    ShowBoard("#search-res-board");

    $(".res-item").dblclick(function(e) {
        let item_dom = $(e.target);
        ShowDetail(item_dom.attr("nid"), item_dom.attr("key"), item_dom.attr("range"));
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

    // 关键字着色
    for(var cur_key of keys) {
        $(".res-item").mark(cur_key, {
            className: "mark-highlight"
        });
    }

    Info("已更新" + v.length + "条搜索结果");
}

function ShowBoard(dom_str){
    $(".board").hide();
    $(dom_str).show();
}

function UpdateLastNote(v){
    note_data.last_note = v;
    var last_note_ele = $('#last-note');
    $("#last-note-title").text(v.name);
    last_note_ele.val(v.content)

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
    detail_data.key = key.split(',');
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
                className: "mark-highlight"
            });
        }
    }, 200);
}

function IsLastModify(){
    return $("#last-note").val() != note_data.last_note.content;
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
    $(".board").css('height', ($(window).height() - 100) + 'px');
    $("#res-detail").css('max-height', ($(window).height() - 120) + 'px');
}

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
        var diff = Diff.diffChars(note_data.last_note.content, $("#last-note").val()),
            fragment = document.createDocumentFragment();

        diff.forEach(function(part){
            // green for additions, red for deletions, grey for common parts
            color = part.added ? 'green' : part.removed ? 'red' : '';
            span = document.createElement('span');
            span.style.color = color;
            span.appendChild(document.createTextNode(part.value));
            fragment.appendChild(span);
        });
        display.append(fragment);
        MyModal.Info(display, "note diff");
    });

    $("#last-note").on('input', MyTimer.Dbounce(()=>{
        if(IsLastModify()){
            $("#edit-flag").show();;
        }else{
            $("#edit-flag").hide();
        }
    }, 300));

    $("#dir-note-btn").click(function(){
        CallSys("get_all_note_names");
    });

});

$(window).resize(function(){
    InitSize();
});