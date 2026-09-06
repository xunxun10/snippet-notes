let fs = require('fs');
let sqlite3 = require('sqlite3').verbose();
let MyFile = require('./my_file')


class SqliteDB{

    // 构造一个数据库实例，支持如果数据库不存在则使用初始化语句创建数据库
    // var SqliteDB = require('./sqlite.js');
    // var db_ins = new SqliteDB("Gis1.db");
    // db_init_sql db初始化语句数组，如果数据库不存在则使用该语句创建数据库
    constructor(file, db_init_sql = null, always_create = false){
        let exist = fs.existsSync(file);
        if(!exist){
            console.log("db file not exist, will create it !");
            MyFile.ToucFile(file)
        };
        MyFile.ToucFile(file)
        this.db = new sqlite3.Database(file);
        // 多进程同时读写同一db时，遇到锁等待而非立即报错
        this.db.run("PRAGMA busy_timeout = 3000;");
        // 建表语句异步执行，记录promise供WaitInit等待完成
        this.init_promises = [];
        if((!exist || always_create) && db_init_sql){
            // 遍历db_init_sql数组执行建表语句
            for(var i = 0; i < db_init_sql.length; ++i){
                this.init_promises.push(SqliteDB.CreateTable(this.db, db_init_sql[i]));
            }
        }
    };

    // 等待构造时提交的建表语句全部完成
    async WaitInit(){
        if(this.init_promises.length > 0){
            await Promise.all(this.init_promises);
            this.init_promises = [];
        }
    };

    // 不安全，有SQL注入风险，注意不要使用用户输入的数据
    // var createTileTableSql = "create table if not exists tiles(level INTEGER, longitude REAL, content BLOB);";
    // db_ins.CreateTable(createTileTableSql);
    static async CreateTable (db_ins, sql){
        return new Promise((resolve, reject) => {
            db_ins.serialize(function(){
                db_ins.run(sql, function(err){
                    if(null != err){
                        SqliteDB.Error(err);
                        reject(err)
                    }else{
                        resolve()
                    }
                });
            });
        })
    };

    // query data.
    // var querySql = 'select * from tiles where level = ? and column >= ?';
    // db_ins.Query(querySql, [1, 10], DataDealFun);
    async Query (sql, params){
        return new Promise((resolve, reject) => {
            this.db.serialize(function(){
                this.all(sql, params, function(err, rows){
                    if(null != err){
                        SqliteDB.Error(err);
                        reject(err)
                    }else{
                        resolve(rows)
                    }
                });
            })
        })
    };

    // update data.
    // var updateSql = 'update tiles set level = ?, content= ? where level = ?';
    // db_ins.Run(updateSql, [1, '', 2]);
    // insert into tiles(level, longitude, content) values(?, ?, ?)
    Run(sql, params){
        return new Promise((resolve, reject) => {
            this.db.serialize(function(){
                this.run(sql, params, function(err){
                    if(null != err){
                        SqliteDB.Error(err);
                        reject(err)
                    }else{
                        resolve()
                    }
                });
            })
        })
    };
    
    Close (){
        this.close();
    };

    static Error(err, errno = 0){
        let errMsg = "Error Message:" + err.message + " ErrorNumber:" + errno
        console.log(errMsg);
        throw new Error(errMsg)
    };
}

module.exports = SqliteDB;

/*
function dataDeal(objects){
    for(var i = 0; i < objects.length; ++i){
        console.log(objects[i]);
    }
}
*/