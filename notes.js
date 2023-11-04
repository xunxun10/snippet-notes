const MyDb = require('./util/my_sldb')
const MyLog = require('./util/my_log')
const {MyString} = require('./util/my_util')
const {NoteSearcher} = require('./util/note_searcher')

//var lunr = require('./lib/lunr/lunr-codepiano.js');
var lunr = require('./lib/lunr/lunr.js');
require('./lib/lunr/lunr.stemmer.support.js')(lunr);
require('./lib/lunr/tinyseg.js')(lunr);
require('./lib/lunr/lunr.zh.china.js')(lunr); // 中文 or any other language you want, 默认英文
//require('./lib/lunr/lunr.multi.js')(lunr); // 支持多语言

class Note{
    constructor(id, name, content) {
        this.id = id;
        this.name = name;
        this.content = content;
    }
}

class Notes{
    static async Init(note_db_file){
        this.db = new MyDb(note_db_file, "create table if not exists notes(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, content TEXT);")
        let notes = await Notes.GetAllNotes();
        this.IdxLunr(notes)
    }

    /**
     * 重建搜索索引
     */
    static async IdxLunr(notes){
        /* init lunr */
        this.idx = lunr(function () {
            // use the language (zh)
            //this.use(lunr.multiLanguage('ja', 'zh'));
            this.use(lunr.zh);

            // then, the normal lunr index initialization
            this.ref('id');
            this.field('title', { boost: 10 })
            this.field('content')
            this.metadataWhitelist = ['position']

            for (var i=0; i<notes.length; i++) {
                this.add({
                    "id": notes[i]['id'],
                    "title": notes[i]['name'],
                    "content": notes[i]['content']
                });
            }
        });
    }

    static async GetAllNotes(){
        return await this.db.Query("select * from notes")
    }

    static async GetAllNoteNames(){
        return await this.db.Query("select id,name from notes");
    }

    /**
     * 如果存在则保存，不存在则新建
     * @param {Note} note 
     */
    static async Save(note){
        if(note.id < 0){
            // 新建
            await this.db.Run("insert into notes (name, content) values (?,?)", [note.name, note.content]);
            // TODO 需要补充获取最新ID的逻辑
            let insert_id_rows = await this.db.Query("select last_insert_rowid() from notes", []);
            let insert_id = insert_id_rows[0]['last_insert_rowid()']
            console.debug('inserted id: ' + insert_id);
            if(insert_id < 1 || !insert_id){
                throw new Error("get insert id error: " + insert_id);
            }
            let new_note = note;
            new_note.id = insert_id;
            return new_note;
        }else{
            // 更新
            await this.db.Run("update notes set name = ?, content = ? where id = ?", [note.name, note.content, note.id]);
        }
        return note;
    }

    /**
     * 刷新搜索索引
     * @param {Note} note 
     */
    static async RefreshIdx(note){
        this.IdxLunr(await Notes.GetAllNotes())
    }

    static async ReadNote(id){
        let note = await this.db.Query("select * from notes where id = ?", [id])
        if(note.length < 1){
            MyLog.Warn("无法找到笔记:" + id);
            return new Note(-1, '新笔记', '')
        }else if(note.length > 1){
            throw new Error("找到多个笔记:" + id)
        }else{
            return new Note(note[0]['id'], note[0]['name'], note[0]['content'])
        }
    }


    /**
     * 聚合搜索的结果，对每个搜索结果进行处理，返回包含数据所在行并进行前后扩展的数据
     * @param {*} lunr_res_data 
     * @param {*} share_params 
     * @returns 
     */
    static async Aggregate(lunr_res_data, share_params, include_strs = null){
        let note_id = lunr_res_data["ref"];
        let note = await this.ReadNote(note_id);
        let slice_set = lunr_res_data["matchData"]["metadata"];
        let slice_results = [];
        if(!share_params.matched_range[note_id]){
            share_params.matched_range[note_id] = [];
        }
        for (let key in slice_set) {
            //console.log('key: ' + key);  // debug
            let slice = slice_set[key];
            let keys = new Set();
            keys.add(key);
            if('content' in slice){
                // 存在content
                for(let pos_range of slice['content']['position']){
                    let begin_src = pos_range[0];
                    let end_src = pos_range[0] + pos_range[1];
                    let new_begin = MyString.GetPrePos(note.content, begin_src, '\n', 6);
                    let new_end = MyString.GetAfterPos(note.content, begin_src, '\n', 5);
                    let cur_range_str = note.content.substring(new_begin, new_end);
                    if(include_strs){
                        // 如果指定了必须包含的字符串数组，则只有包含这些字符串时才返回
                        let include = true;
                        for(let include_str of include_strs){
                            if(cur_range_str.indexOf(include_str) < 0){
                                include = false;
                                break;
                            }
                        }
                        if(!include){
                            continue;
                        }else{
                            // 遍历include_strs元素并将其加入到keys中
                            for(let include_str of include_strs){
                                keys.add(include_str);
                            }
                        }
                    }
                    if(!MyString.CheckInRange(share_params.matched_range[note_id], begin_src, end_src)){
                        // TODO 后面数据包含前面数据时会展现为两条数据，可以优化
                        let cur_range = [new_begin, new_end];
                        share_params.matched_range[note_id].push(cur_range);
                        // console.log('keys: ' + JSON.stringify(Array.from(keys)));   // debug
                        slice_results.push({id:note_id, name:note.name, key: Array.from(keys), range:cur_range, str:cur_range_str});
                    }
                }
            }else{
                // 只存在title
                let cur_range = [0, 50];
                share_params.matched_range[note_id].push(cur_range);
                slice_results.push({id:note_id, name:note.name, key: Array.from(keys), range:cur_range, str:note.content.substring(cur_range[0], cur_range[1])});
            }
        }
        return slice_results;
    }

    /**
     * 根据关键字获取搜索结果，对于lunr结果进行处理，返回具体到行的数据
     * @param {String} str 
     * @returns 
     */
    static async Search(str){

        let note_slice = [];
        let share_params = { matched_range: new Map() };

        // 先试用 NoteSearcher 进行完全匹配搜索
        let notes = await this.GetAllNotes();
        // 正则搜索时自动替换空格为.*
        let full_match_result = NoteSearcher.searchNotes(str.replace(/\s+/g, '.*').replace(/\+/g, ''), notes);
        for(let i = 0; i < full_match_result.length; ++i) {
            //console.log("reg match: " + JSON.stringify(full_match_result[i]));  // DEBUG
            var new_result = await this.Aggregate(full_match_result[i], share_params);
            // 连接数组
            note_slice.push.apply(note_slice, new_result);
        }

        // 如果str含有空格则对每个子串进行搜索并对结果取交集
        if(str.indexOf(' ') > 0){
            let sub_strs = str.replace(/\+/g, '').split(' ');
            // 找出最长的字符串，通过NoteSearcher.searchNotes搜索出结果，再通过Aggregate函数对剩余的字符串进行包含检查
            let max_len = 0;
            let max_str = '';
            for(let sub_str of sub_strs){
                if(sub_str.length > max_len){
                    max_len = sub_str.length;
                    max_str = sub_str;
                }
            }
            // 找出去掉最长字符串的数组
            sub_strs.splice(sub_strs.indexOf(max_str), 1);

            let sub_result = NoteSearcher.searchNotes(max_str, notes);
            for(let i = 0; i < sub_result.length; ++i) {
                //console.log("multiple match: " + JSON.stringify(sub_result[i]));  // DEBUG
                var new_result = await this.Aggregate(sub_result[i], share_params, sub_strs);
                // 连接数组
                note_slice.push.apply(note_slice, new_result);
            }
        }else{
            // 使用lunr进行搜索
            let lunr_result = this.idx.search(str)
            for(let i = 0; i < lunr_result.length; ++i) {
                //console.log("lunr match: " + JSON.stringify(lunr_result[i])); // DEBUG
                var new_result = await this.Aggregate(lunr_result[i], share_params);
                // 连接数组
                note_slice.push.apply(note_slice, new_result);
            }
        }

        //console.log(JSON.stringify(note_slice));      // DEBUG

        return note_slice;
    }
}

module.exports = Notes;