function ShowNoteList(note_names){
    let note_dir = $('<div></div>');
    // 渲染笔记列表
    for (var i=0; i<note_names.length; i++) {
        note_dir.append('<div class="note-item-container"><button class="dir-to-note-btn" data-nid="'+note_names[i]['id']+'">'+note_names[i]['name'].substr(0, 30)+'</button></div>');
    }
    
    var modal = MyModal.Info(note_dir, "所有笔记");
    
    // 笔记按钮点击事件
    $('.dir-to-note-btn').click(function(){
        modal.modal("hide");
        EditSearchDetail($(this).attr("data-nid"));
        note_data.first_open = true;
    });
    
    // 使用jquery.contextMenu模块初始化右键菜单
    $.contextMenu({
        selector: '.dir-to-note-btn',
        trigger: 'right',
        items: {
            "setDefault": {
                name: "设置为默认笔记",
                callback: function(key, opt) {
                    var note_id = $(this).attr("data-nid");
                    var note_name = $(this).text();
                    // 调用后台设置默认笔记
                    CallSys("set-default-note", {note_id: note_id});
                }
            }
        },
        // 菜单样式
        cssClasses: {
            "menu": "context-menu",
            "item": "context-menu-item",
            "hover": "context-menu-hover"
        }
    });
}

/**
 * 显示笔记修改历史列表
 * @param {*} notes_info 
 */
function ShowHistoryNoteList(notes_info){
    let note_his_div = $("<div></div>");
    note_his_div.append("<div id='note-history-desc'><span>说明：每份笔记将保存25天的变更历史，每天只保留最后一份数据</span></div>");
    let today = MyDate.GetToday();
    for (var i=0; i<notes_info.length; i++) {
        // 排除当天的历史笔记
        if(notes_info[i]['time'] == today){
            continue;
        }
        note_his_div.append("<button class='show-note-his-btn' hisid='"+notes_info[i]['id']+"' title='显示当前笔记与历史的差异(红色表示最新笔记已删除内容)'>" + notes_info[i]['time'] + ": " +notes_info[i]['name'].substr(0, 30)+"</button>");
    }
    MyModal.Info(note_his_div, "笔记历史");
    $(".show-note-his-btn").click(function(){
        // 调用后台获取历史笔记数据
        CallSys("get-note-his-diff", $(this).attr("hisid"));
    });
}