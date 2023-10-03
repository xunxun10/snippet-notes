var MyNum = class{
    static Two(num) {
        return num < 10 ? "0" + num : num;
    }
}

var MyDate = class{
	// 返回end-start的天数
	static DiffDays(begin_date_str, end_date_str){
       	return Math.floor((Date.parse(end_date_str) - Date.parse(begin_date_str)) / (1000 * 3600 * 24));
	};

	/**
	 * 获取对今日增加一定天数后的日期
	 * @param add_days
	 * @returns date_obj
	 */
	static GetNextNDay(add_days, start_day_str=''){
		if(start_day_str != ''){
			var a = Date.parse(start_day_str);
		}else{
			var a = new Date();
		}
		return new Date(a.valueOf() + add_days * 24 * 60 * 60 * 1000);
	};

	/**
	 * 
	 * @param {*} add_days 
	 * @param {*} start_day_str 
	 * @param Boolean inclue_xq 返回信息是否包含星期信息
	 */
	static GetNextNDayStr(add_days, start_day_str='', inclue_xq=false){
		let new_date = this.GetNextNDay(add_days, start_day_str);
		if(inclue_xq){
			return this.GetDateStr(new_date) + " " + this.GetXqFromDate(new_date);
		}else{
			return this.GetDateStr(new_date);
		}
	}
	
	/**
	 * 获取本周已经过去的天数，从周一开始计算，今天周二则返回1,周一返回0
	 * @param {*} date_obj 
	 */
	static GetPastDays(date_obj){
		let days = date_obj.getDay() - 1;
		// 处理周天
		return days >= 0 ? days : days + 7;
	}

    
    /**
     * 将date对象转换为字符串xxxx-xx-xx格式
     * @param mydate
     */
    static GetDateStr(mydate, show_time=false){
        let date_str = mydate.getFullYear() + "-" + MyNum.Two(mydate.getMonth() + 1) + "-" + MyNum.Two(mydate.getDate());
        if(show_time){
            return date_str + " " + this.GetTime6Str(mydate);
        }
        return date_str;
    }

    static GetToday(){
        return this.GetDateStr(new Date());
    }

    /**
     * 返回当前日期及时间，格式为 2023-01-01 19:00:00
     * @returns  {string} Returns
     */
    static Now(){
        return this.GetDateStr(new Date(), true);
    }

    /**
     * 根据日期返回星期信息
     * @param date_obj Date对象
     */
    static GetXqFromDate(date_obj)
    {
        var dayNames = new Array("星期日","星期一","星期二","星期三","星期四","星期五","星期六"); 
        return dayNames[date_obj.getDay()];
    }

    /**
     * 获取对今日增加一定天数后的日期及星期信息
     * @param add_days
     * @returns date_xq_str, like XXXX-XX-XX日 星期X
     */
    static getNextNDayDetailStr(add_days){
        var d = getNextNDay(add_days);
        return GetXqFromDate(d) + " " + GetDateStr(d) + "日";
    }

    static GetTime6Str(mydate){
        return MyNum.Two(mydate.getHours()) + ":" + MyNum.Two(mydate.getMinutes()) + ":" + MyNum.Two(mydate.getSeconds());
    }

    static getCurTime6(){
        return GetTime6Str(new Date());
    }

    static GetTime4Str(mydate){
        return MyNum.Two(mydate.getHours()) + ":" + MyNum.Two(mydate.getMinutes());
    }
    static GetCurTime4(){
        return GetTime4Str(new Date());
    }
};

var MyString = class{
    /**
     * 获取str字符串中，从begin位置开始向前搜索，出现第 search_times 次 search_char 后+1位置
     * @param {string} str 
     * @param {int} begin 
     * @param {string} search_char 
     * @param {int} search_times 
     */
    static GetPrePos(str, begin, search_char, search_times){
        let match_time = 0;
        let more_flag = false;
        for(var i=begin; i>=0; --i){
            // 如果前面两个字符都是换行符则终止
            if(i >= 2 && str.charAt(i) == search_char && str.charAt(i-1) == search_char && str.charAt(i-2) == search_char){
                break;
            }
            // 如果字符大于1000时则终止
            if(begin - i > 1000){
                break;
            }
            // 如果字符大于500设置more_flag
            if(begin - i > 500){
                more_flag = true;
            }
            // 如果more_flag为true且遇到search_char则终止
            if(more_flag && str.charAt(i) == search_char){
                break;
            }
            if(str.charAt(i) == search_char){
                ++match_time;
                if (match_time >= search_times){
                    break;
                }
            }
        }
        let ret = i + 1;   // 已考虑未找到时为-1的情况
        // 如果前面字符为search_char则返回后面位置
        if(str.charAt(ret) == search_char && ret+1 < str.length){
            ret += 1;
        }
        return ret;
    }

    /**
     * 获取str字符串中，从begin位置开始向后搜索，出现第 search_times 次 search_char 后位置
     * @param {string} str 
     * @param {int} begin 
     * @param {string} search_char 
     * @param {int} search_times 
     * @returns 返回结束位置，位置后闭
     */
    static GetAfterPos(str, begin, search_char, search_times){
        let match_time = 0;
        let more_flag = false;
        for(var i=begin; i<str.length; ++i){
            // 如果后面连续两个字符都是换行符则终止
            if(i < str.length - 2 && str.charAt(i) == search_char && str.charAt(i+1) == search_char && str.charAt(i+2) == search_char){
                break;
            }
            // 如果字符大于1000时则终止
            if(i - begin > 1000){
                break;
            }
            // 如果字符大于500设置more_flag
            if(i - begin > 500){
                more_flag = true;
            }
            // 如果more_flag为true且遇到search_char则终止
            if(more_flag && str.charAt(i) == search_char){
                break;
            }
            if(str.charAt(i) == search_char){
                ++match_time;
                if (match_time >= search_times){
                    break;
                }
            }
        }
        let ret = i;   // 已考虑未找到时为length的情况
        // 如果后面字符为search_char则返回前一个位置
        if(str.charAt(ret) == search_char && ret-1 >= 0){
            ret -= 1;
        }
        return ret;
    }

    /**
     * 检查
     * @param {Array} rang_arr 
     * @param {int} begin 
     * @param {int} end 
     */
    static CheckInRange(rang_arr, begin, end){
        for(var item of rang_arr){
            if(begin >= item[0] && end <= item[1]){
                return true;
            }
        }
        return false;
    }
};

var MyScroll = class {
    // 注意如果传入的节点不是已经渲染后的节点，注意添加一定延时调用
    // 不支持textarea
    static ScrollToTextPosition(dom_str, start, end, recover_after_scroll = true, class_name='auto-scroll-to-here'){
        var dom_obj = document.querySelector(dom_str).firstChild;
        var repl = document.createElement('mark');
        var startNode = dom_obj.splitText(start);
        var ret = startNode.splitText(end - start);
        repl.setAttribute('class', class_name);
        repl.textContent = startNode.textContent;
        startNode.parentNode.replaceChild(repl, startNode);
        // instant or smooth 
        repl.scrollIntoView({ behavior: "instant", block: "start" });

        if(recover_after_scroll){
            // 滚动后再将增加的类取消
            repl.parentNode.replaceChild(startNode, repl);
        }

        return ret;
    }

    static ToTextareaPosition(dom_str, start){
        let dom = $(dom_str);
        let line_height = Number(dom.css('line-height').split('px')[0]);
        let fsize = Number(dom.css('font-size').split('px')[0]);
        let width = dom.width();
        let height = dom.height();
        let word_in_line = width / fsize;
        let content = dom.val();
        let passed_lines = 0;
        let line_passed = 0;
        let calc_height = 0;
        for (let i = 0; i < content.length; i++) {
            if(i >= start){
                break;
            }
            let cur_char = content.charAt(i);
            if(cur_char == '\n'){
                passed_lines++;
                line_passed = 0;
            }else{
                if(line_passed >= word_in_line){
                    passed_lines++;
                    line_passed = 0;
                }
            }
            line_passed ++;
        }
        calc_height = passed_lines * line_height - height;
        dom.scrollTop(calc_height > 0 ? calc_height : 0);
    }
}


var MyTimer = class{

    static _debounce_timer_map = {};  // 内部变量，请勿直接使用

    /**
     * 防抖函数
     * @param {*} func 要执行的函数
     * @param {*} delay 防抖时间,单位毫秒
     */
    static Debounce(func, delay, timer_name='default') {
        // 设置定时器标识
        // 返回事件绑定函数
        return function() {
            // 处理func中this及参数
            let context = this;
            let args = arguments;
            // 先清除定时器
            let timer = MyTimer._debounce_timer_map[timer_name];
            if(timer){
                clearTimeout(timer);
            }
            
            timer = setTimeout(() => {
                func.apply(context, args);
            }, delay);
            MyTimer._debounce_timer_map[timer_name] = timer;
        }
    };
}

var MyModal = class {

    /**
     * 展示信息及关闭按钮
     * @param {*} content 
     * @param {*} title 
     */
    static Info(content, title='SnippetNote Info', width='1000px', height='600px') {
        if($("#my-info").length < 1){
            let modal = `
            <div class="modal fade" id="my-info" tabindex="-1" role="dialog" aria-labelledby="my-info-label" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>
                            <h4 class="modal-title" id="my-info-label">模态框（Modal）标题</h4>
                        </div>
                        <div class="modal-body" id="my-info-content">在这里添加一些文本</div>
                    </div>
                </div>
            </div>`;
            $("body").append($(modal));
            // 避免点击及esc时退出
            // $("#my-info").modal({backdrop: 'static', keyboard: false});
        }
        $("#my-info-label").text(title);
        $("#my-info-content").html(content);
        $("#my-info").modal('show');
        MyModal.Resize('#my-info', width, height);
        return $("#my-info");
    }

    static Alert(content, ok_fun = null, title='SnippetNote Info') {
        if($("#my-alert").length < 1){
            let modal = `
            <div class="modal fade" id="my-alert" tabindex="-1" role="dialog" aria-labelledby="my-alert-label" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <!--<button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>-->
                            <h4 class="modal-title" id="my-alert-label">模态框（Modal）标题</h4>
                        </div>
                        <div class="modal-body" id="my-alert-content">在这里添加一些文本</div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-primary" data-dismiss="modal" id="my-alert-ok">确定</button>
                        </div>
                    </div>
                </div>
            </div>`;
            $("body").append($(modal));
            // 避免点击及esc时退出
            $("#my-alert").modal({backdrop: 'static', keyboard: false});
        }
        $("#my-alert-label").text(title);
        $("#my-alert-content").html(content);
        ok_fun && $("#my-alert-ok").off("click").click(ok_fun);
        $("#my-alert").modal('show');
        MyModal.Resize('#my-alert');
    }

    static Confirm(content, ok_fun=null, cancele_fun=null, title='SnippetNote Confirm') {
        if($("#my-confirm").length < 1){
            let modal = `
            <div class="modal fade" id="my-confirm" tabindex="-1" role="dialog" aria-labelledby="my-confirm-label" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <!--<button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>-->
                            <h4 class="modal-title" id="my-confirm-label">模态框（Modal）标题</h4>
                        </div>
                        <div class="modal-body" id="my-confirm-content">在这里添加一些文本</div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-primary" data-dismiss="modal" id="my-confirm-ok">确定</button>
                            <button type="button" class="btn btn-default" data-dismiss="modal" id="my-confirm-cancel">取消</button>
                        </div>
                    </div>
                </div>
            </div>`
            $("body").append($(modal));
            // 避免点击及esc时退出
            $("#my-confirm").modal({backdrop: 'static', keyboard: false});
        }

        $("#my-confirm-label").text(title);
        $("#my-confirm-content").html(content);
        ok_fun && $("#my-confirm-ok").off("click").click(ok_fun);
        cancele_fun && $("#my-confirm-cancel").off("click").click(cancele_fun);
        $("#my-confirm").modal('show')
        MyModal.Resize('#my-confirm');
    }

    static Resize(modal_id, width=null, height=null){
        var $this = $(modal_id);
        var win_height = $(window).height();
        var win_width = $(window).width();
        var modal_dialog = $this.find(".modal-dialog");
        var content = $this.find('.modal-body');
        width && modal_dialog.css('width', width);
        height && content.css('height', height);
        setTimeout(() => {
            // 渲染需要时间，modal_dialog.height()需要延迟计算
            var m_top = ( $(window).height() - modal_dialog.height() ) / 3;
            modal_dialog.css({'margin': m_top + 'px auto'});
            modal_dialog.css({'max-height': win_height - 100 + 'px', 'max-width': win_width - 100 + 'px'});
        }, 200);
    }
}

if(typeof module != "undefined" && typeof module.exports != "undefined"){
    module.exports = { MyDate, MyString };
}