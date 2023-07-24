const { createLogger, format, transports } = require('winston');
const {MyDate} = require('./my_util')

class MyLog{
    /**
     * 
     * @param {string} log_file_path 不包含后缀名的日志文件路径 
     */
    static Init(log_file, test_env=true){
        this.logger = createLogger({
            level: 'info',
            format:format.combine(
                format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
                //format.align(),
                format.printf(info => `${[info.timestamp]}: ${info.level} : ${info.message}`),
            ),
            defaultMeta: { service: 'user-service' },
            transports: [
                // error 及以上日志写入文件
                new transports.File({ filename: log_file + '.error.log', level: 'error' }),
                // 所有日志写入文件
                new transports.File({ filename: log_file + '.log' }),
            ],
        });

        // If we're in test env then also log to the `console` with the format:
        // `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
        if (test_env) {
            // 不知为何vscode 中未生效
            this.logger.add(new transports.Console({
                level: 'debug'
            }));
        }
    }

    static FromatLog(info, level='info'){
        return MyDate.Now() + " " + level + ': ' + info;
    }

    static Info(info){
        console.log(this.FromatLog(info));
        this.logger.info(info);
    }

    static Warn(info){
        console.warn(this.FromatLog(info, 'warn'));
        this.logger.warn(info);
    }

    static Error(info){
        console.error(this.FromatLog(info, 'error'));
        this.logger.error(info);
    }

    static Debug(info){
        console.debug(this.FromatLog(info, 'debug'));
        this.logger.debug(info);
    }
}


module.exports = MyLog;