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


    static async _CutOneNoteResult(lunr_res_data, share_params){
        let note_id = lunr_res_data["ref"];
        let note = await this.ReadNote(note_id);
        let slice_set = lunr_res_data["matchData"]["metadata"];
        let slice_results = [];
        let keys = [];
        for (let key in slice_set) {
            let slice = slice_set[key];
            keys.push(key);
            if('content' in slice){
                // 存在content
                for(let pos_range of slice['content']['position']){
                    let new_begin_src = pos_range[0];
                    let new_end_src = pos_range[0] + pos_range[1];
                    let new_begin = MyString.GetPrePos(note.content, new_begin_src, '\n', 3);
                    let new_end = MyString.GetAfterPos(note.content, new_begin_src, '\n', 3);
                    if(!MyString.CheckInRange(share_params.matched_range, new_begin_src, new_end_src)){
                        // console.log(new_begin + ":" +  new_end + " not in " + share_params.matched_range);   // TODO
                        // TODO 后面数据包含前面数据的情况没有处理
                        // TODO 如果其他文件的匹配度大于本文件后续条目时处理是否会有问题？
                        let cur_range = [new_begin, new_end];
                        share_params.matched_range.push(cur_range);
                        slice_results.push({id:note_id, name:note.name, key: keys, range:cur_range, str:note.content.substring(cur_range[0], cur_range[1])});
                    }
                }
            }else{
                // 只存在title
                let cur_range = [0, 50];
                matched_range.push(cur_range);
                slice_results.push({id:note_id, name:note.name, key: keys, range:cur_range, str:note.content.substring(cur_range[0], cur_range[1])});
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
        let share_params = { matched_range: [] };

        // 先试用 NoteSearcher 进行完全匹配搜索
        let notes = await this.GetAllNotes();
        let full_match_result = NoteSearcher.searchNotes(str, notes);
        for(let i = 0; i < full_match_result.length; ++i) {
            // console.log(JSON.stringify(full_match_result[i]));  // TODO
            var new_result = await this._CutOneNoteResult(full_match_result[i], share_params);
            // 连接数组
            note_slice.push.apply(note_slice, new_result);
        }

        let lunr_result = this.idx.search(str)
        for(let i = 0; i < lunr_result.length; ++i) {
            // console.log(JSON.stringify(lunr_result[i])); // TODO
            var new_result = await this._CutOneNoteResult(lunr_result[i], share_params);
            // 连接数组
            note_slice.push.apply(note_slice, new_result);
        }

        // TODO: remove
        //console.log(JSON.stringify(lunr_result));
        //console.log(JSON.stringify(note_slice));

        return note_slice;
    }
}

module.exports = Notes;