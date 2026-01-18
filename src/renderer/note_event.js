
// 当用户复制search-res-board、res-detail-board内容时，移除所有 <mark> 标签
$(document).on('copy', function(event) {
    var selection = window.getSelection(); // 获取当前选中的内容

    // 判断选中的内容是否为search-res-board、res-detail-board中的元素
    if ($(selection.anchorNode).closest('#search-res-board, #res-detail-board').length === 0) {
        return;
    }else{
        console.log("copy data will remove html tag");
    }

    event.preventDefault(); // 阻止默认的复制行为

    var range = selection.getRangeAt(0); // 获取选中内容的范围
    var clonedSelection = range.cloneContents(); // 克隆选中的内容

    // 复制内容到剪贴板
    event.originalEvent.clipboardData.setData('text/plain', $(clonedSelection).text());
});