const fs = require('fs')
const fsext = require('fs-extra');
const path = require('path')

class MyFile{

    /**
     * 判断文件是否存在
     * @param {string} file_path 
     * @returns 
     */
    static IsExist(file_path){
        return fs.existsSync(file_path);
    }

    /**
     * 文件不存在时直接创建,存在时无操作
     * @param {*} file_path 
     * @param {*} error_callback 
     */
    static ToucFile(file_path) {
        if( ! fs.existsSync(file_path)){
            console.log('File ' + file_path + ' does not exist')
            fsext.createFileSync(file_path);
        }
    }

    /**
     * 保存失败时抛出异常
     * @param {*} file_path 
     * @param {*} contents 
     */
    static SaveFile(file_path, contents){
        fs.writeFile(file_path, contents, (err) => {
            if (err) throw err;
        });
    }

    /**
     * 读取失败时抛出异常
     * @param {*} file_path 
     * @returns 
     */
    static SyncRead(file_path){
        let data = fs.readFileSync(file_path, 'utf8')
        return data;
    }

    /**
     * 同步方式移动文件
     * @param {*} src 
     * @param {*} dest 
     * @param {*} overwrite 
     * @returns 
     */
    static Move(src, dest, overwrite=false){
        // 存在时默认不直接覆盖
        return fsext.moveSync(src, dest, { overwrite:overwrite });
    }

    /**
     * 同步方式拷贝文件
     * @returns 
     */
    static Copy(src, dest, overwrite=false){
        return fsext.copySync(src, dest, { overwrite:overwrite });
    }
}

module.exports = MyFile;