const MyFile = require('./my_file');

var fs = require('fs'), ini = require('ini') 

class MyConf{
    constructor(cfg_path) {
        this.cfg_path = cfg_path
        MyFile.ToucFile(this.cfg_path)
        this.Reload()
    }

    /**
     * 重新加载并解析配置
     */
    Reload() {
        this.parsed_cfg = ini.parse(fs.readFileSync(this.cfg_path, 'utf-8'))
    }

    /**
     * 获取整个解析后的配置的根节点
     * 使用方式：GetRoot().node_name.param_name
     * @returns 
     */
    GetRoot(){
        return this.parsed_cfg;
    }

    /**
     * 获取值
     * @param {*} node 
     * @param {*} name 
     * @returns 
     */
    Get(name, node='global'){
        if(!this.parsed_cfg[node]){
            return null
        }
        return this.parsed_cfg[node][name]
    }

    /**
     * 设置值并保存
     * @param {string} node 
     * @param {string} name 
     * @param {*} value 
     */
    Set(name, value, node='global'){
        if(!this.parsed_cfg[node]){
            this.parsed_cfg[node] = {}
        }
        this.parsed_cfg[node][name] = ini.safe(value)
        fs.writeFileSync(this.cfg_path, ini.stringify(this.parsed_cfg))
    }

    GetOrSet(name, def_value, node='global'){
        if(!this.Get(name, node)){
            this.Set(name, def_value, node)
        }
        return this.Get(name, node)
    }
}

module.exports = MyConf;