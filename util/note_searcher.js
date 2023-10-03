
var NoteSearcher = class{

    /**
     * 从note的content中使用正则匹配方式搜索字符串，将所有匹配的行及字符位置返回
     * @param {*} searchText 
     * @param {*} notes 一个数组，每个元素是一个note对象，note对象包含id、name和content
     * @returns 返回一个数组，每个元素是一个对象，对象包含行号和匹配的字符位置，格式为 
     *          [ {"ref":id_xxx, "matchData":{"metadata":{"search_str_xxx":{"content":{"position":[[begin, end]]}}}}} ]
     */
    static searchNotes(searchText, notes){
        var result = [];
        // 遍历notes, 对每个note的content进行正则匹配，将匹配的行号和字符位置记录下来,将匹配结果放入result中
        // 正则表达时错误时返回result
        try{
            var match_reg = new RegExp(searchText, "ig");
            for(let note of notes){
                let match = note.content.match(match_reg);
                var readed_pos = 0;
                if(match){
                    for(let i = 0; i < match.length; ++i){
                        let match_pos = [];
                        let match_str = match[i];
                        // 获取匹配的字符位置
                        let begin = note.content.indexOf(match[i], readed_pos);
                        let end = begin + match[i].length;  // 不包括匹配字符
                        readed_pos = end;
                        match_pos.push([begin, match[i].length]);
                        // 注意[match]的中括号不能省略
                        result.push({"ref":note.id, "score":100, 'reg':searchText, "matchData":{"metadata":{[match_str]:{"content":{"position":match_pos}}}}});
                    }
                }
            }
            return result;
        }catch(e){
            console.error("error catched: " + e);
            return result;
        }
    }
}

module.exports = { NoteSearcher };