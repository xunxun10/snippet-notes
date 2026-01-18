const MyDb = require('./util/my_sldb')
const MyLog = require('./util/my_log')
const {MyDate, MyString} = require('./util/my_util')
const {NoteSearcher} = require('./util/note_searcher')

class Note{
    constructor(id, name, content) {
        this.id = id;
        this.name = name;
        this.content = content;
    }
}

class Notes{
    static async Init(note_db_file){
        // 初始化数据库时自动创建笔记表、笔记历史表和笔记参数表
        this.db = new MyDb(note_db_file, [
            "create table if not exists notes(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, content TEXT);",
            "create table if not exists notes_history(id INTEGER PRIMARY KEY AUTOINCREMENT, note_id INTEGER, time DATE, name TEXT, content TEXT);",
            "create table if not exists note_params(id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, value TEXT, description TEXT, create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP, update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP);"
        ], true)
        let notes = await Notes.GetAllNotes();
    }

    static async GetAllNotes(){
        return await this.db.Query("select * from notes")
    }

    static async GetAllNoteNames(){
        return await this.db.Query("select id,name from notes");
    }

    /**
     * 获取笔记参数值
     * @param {string} key - 参数键
     * @returns {Promise<string|null>} 参数值，如果不存在则返回null
     */
    static async GetNoteParam(key){
        let params = await this.db.Query("select value from note_params where key = ?", [key]);
        return params.length > 0 ? params[0]['value'] : null;
    }    

    /**
     * 设置笔记参数值
     * @param {string} key - 参数键
     * @param {string} value - 参数值
     * @param {string} description - 参数描述
     * @returns {Promise<void>}
     */
    static async SetNoteParam(key, value, description){
        // 先检查是否存在
        let existing = await this.db.Query("select id from note_params where key = ?", [key]);
        if(existing.length > 0){
            // 更新
            await this.db.Run("update note_params set value = ?, update_time = CURRENT_TIMESTAMP where key = ?", [value, key]);
        }else{
            // 插入
            await this.db.Run("insert into note_params (key, value, description) values (?, ?, ?)", [key, value, description]);
        }
    }

    /**
     * 获取默认笔记ID
     * @returns {Promise<number|null>} 默认笔记ID，如果不存在则返回null
     */
    static async GetDefaultNoteId(){
        return await this.GetNoteParam("default_note_id");
    }

    /**
     * 设置默认笔记ID
     * @param {number} note_id - 笔记ID
     * @returns {Promise<void>}
     */
    static async SetDefaultNoteId(note_id){
        await this.SetNoteParam("default_note_id", note_id, "默认打开的笔记ID");
    }

    /**
     * 获取某笔记所有历史的id、name、日期信息数组, 最多返回retained_num条数据
     */
    static async GetNoteHistoryInfo(id, retained_num = 25){
        return await this.db.Query("select id,time,name from notes_history where note_id = ? order by date(time) desc limit ?", [id, retained_num]);
    }

    /**
     * 获取根据id获取笔记的历史版本, 最多返回一个笔记
     */
    static async GetNoteHistory(id){
        let notes = await this.db.Query("select * from notes_history where id = ?", [id]);
        return notes.length > 0 ? notes[0] : null;
    }

    /**
     * 检查是否存在某天的历史版本
     */
    static async CheckNoteHistory(id, time){
        let res = await this.db.Query("select * from notes_history where note_id = ? and time = ?", [id, time]);
        return res.length > 0;
    }

    /**
     * 插入笔记到历史版本，日期为今天，传入note对象
     */
    static async InsertNoteHistory(note, retained_num = 25){
        let buffer_size = 20;
        // 同一个id只保留retained_num条数据
        let res = await this.db.Query("select id from notes_history where note_id = ? order by date(time) asc", [note.id]);
        if(res.length >= retained_num + buffer_size){
            // 删除早于retained_num的数据
            await this.db.Run("delete from notes_history where note_id = ? and id <= ?", [note.id, res[res.length - retained_num - 1]['id']]);
        }
        // 获取今天的日期，格式为2021-01-01，toLocaleString及toISOString都有问题
        let today = MyDate.GetToday();
        
        // 如果当天历史版本有插入过则更新，否则插入
        if(await this.CheckNoteHistory(note.id, today)){
            await this.db.Run("update notes_history set name = ?, content = ? where note_id = ? and time = ?", [note.name, note.content, note.id, today]);
        }else{
            await this.db.Run("insert into notes_history (note_id, time, name, content) values (?,?,?,?)", [note.id, today, note.name, note.content]);
        }
    }


    /**
     * 如果存在则保存，不存在则新建
     * @param {Note} note 
     */
    static async Save(note){
        if(note.id < 0){
            // 新建
            await this.db.Run("insert into notes (name, content) values (?,?)", [note.name, note.content]);
            let insert_id_rows = await this.db.Query("select last_insert_rowid() from notes", []);
            let insert_id = insert_id_rows[0]['last_insert_rowid()']
            if(insert_id < 1 || !insert_id){
                throw new Error("get insert id error: " + insert_id);
            }
            let new_note = note;
            new_note.id = insert_id;
            // 插入历史版本
            await this.InsertNoteHistory(new_note);
            return new_note;
        }else{
            // 更新
            await this.db.Run("update notes set name = ?, content = ? where id = ?", [note.name, note.content, note.id]);
            // 插入历史版本
            await this.InsertNoteHistory(note);
        }
        return note;
    }

    /**
     * 刷新搜索索引
     * @param {Note} note 
     */
    static async RefreshIdx(note){
        return;
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
    static async Search(search_obj){
        let str = search_obj.key;
        let search_cur_note_flag = search_obj.cur_note_flag;
        let search_note_id = search_obj.id;

        let note_slice = [];
        let share_params = { matched_range: new Map() };

        // 去掉首尾空格
        str = str.trim();

        // 如果搜索字符串以:开头则表示当次只搜索当前日记
        if(str.startsWith(':')){
            str = str.substring(1).trim();
            search_cur_note_flag = true;
        }

        // 先使用 NoteSearcher 进行完全匹配搜索
        if (search_cur_note_flag){
            var notes = [];
            notes.push(await this.ReadNote(search_note_id));
        }else{
            var notes = await this.GetAllNotes();
        }

        // 如果不是正则搜索则对str的特殊字符进行转义
        if(!search_obj.use_reg){
            str = MyString.EscapeRegExp(str);
        }
        
        // 正则搜索时自动替换空格为.*
        let full_match_result = NoteSearcher.searchNotes(str.replace(/\s+/g, '.*'), notes);
        for(let i = 0; i < full_match_result.length; ++i) {
            //console.log("reg match: " + JSON.stringify(full_match_result[i]));  // DEBUG
            var new_result = await this.Aggregate(full_match_result[i], share_params);
            // 连接数组
            note_slice.push.apply(note_slice, new_result);
        }

        // 如果str含有空格则对每个子串进行搜索并对结果取交集
        if(str.indexOf(' ') > 0){
            let sub_strs = str.replace(/\s+/g, ' ').split(' ');
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
        }

        //console.log(JSON.stringify(note_slice));      // DEBUG

        return note_slice;
    }
}

module.exports = Notes;