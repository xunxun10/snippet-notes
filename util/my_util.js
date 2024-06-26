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
        let more_flag = false;  // 是否已超过字数限制
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
        let ret = i < 0 ? i + 1 : i;   // 考虑未找到时为-1的情况
        // 如果字符为search_char则返回后面位置
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
     * @returns 返回结束位置，返回匹配位置的后一位
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
        let ret = i >= str.length ? i - 1 : i;   // 考虑未找到时为length的情况
        // 如果后面字符为search_char则返回前一个位置
        if(str.charAt(ret) == search_char && ret-1 >= 0){
            ret -= 1;
        }
        return ret + 1;
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

    /**
     * 将字符串中具体正则表达式含义的字符转义，即在特殊字符前增加转义符\
     * @param {*} str 
     * @returns 
     */
    static EscapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

    static ToTextareaPosition(dom_str, position){
        let dom = $(dom_str);
        // 生成一个高度、宽度、padding与原始textarea一样的div，在div position位置插入一个mark标签，获取mark标签的高度，按照高度进行滚动
        let div = $("<textarea></textarea>").css({
            width: dom.innerWidth(),    // width + padding
            height: dom.height(),
            padding: dom.css('padding'),
            fontSize: dom.css('fontSize'),
            fontFamily: dom.css('fontFamily'),
            lineHeight: dom.css('lineHeight'),
            wordWrap: 'break-word',
            wordBreak: 'break-all',
            whiteSpace: 'pre-wrap',
            overflow: 'scroll',
            visibility: 'hidden'
        });
        div.val(dom.val().substring(0, position));
        dom.after(div);  // 必须保留，否则不会渲染
        // 获取div中文本的实际高度
        let text = div.val();
        let text_arr = text.split('\n');
        let line_count = text_arr.length + 1;
        let line_height = Number(div.css('lineHeight').replace('px', ''));
        let text_calc_height = line_count * line_height;
        if( text_calc_height < div.height()){
            // 如果没有出现滚动条，需要计算出文本高度，如果数据有折行，计算会有误差
            var top = text_calc_height - 55;
            console.log('scroll top(not scroll):', top);
        }else{
            var top = div[0].scrollHeight - 35;
            console.log('scroll top(scroll):', top);
        }
        div.remove();
        dom.scrollTop(top);
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

/**
 * Bootstrap模态框的封装
 */
var MyModal = class {

    static SetMaxZIndex(modal_id){
        // 设置z-index为当前所有模态框最大值+1
        let max_z_index = 100;
        $(".modal").each(function(){
            let z_index = $(this).css('z-index');
            if(z_index != 'auto'){
                z_index = Number(z_index);
                if(z_index > max_z_index){
                    max_z_index = z_index;
                }
            }
        });
        $(modal_id).css('z-index', max_z_index + 1);
    }

    /**
     * 展示信息及关闭按钮
     * @param {*} content 
     * @param {*} title 
     * @param {*} width
     * @param {*} height
     * @param {*} id_str 用于指定modal的额外id标识
     */
    static Info(content, title='SnippetNotes Info', width='1000px', height='600px', id_str="") {
        if($("#my-info" + id_str).length < 1){
            let modal = `
            <div class="modal fade" id="my-info${id_str}" tabindex="-1" role="dialog" aria-labelledby="my-info-label" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>
                            <h4 class="modal-title" id="my-info-label${id_str}">模态框（Modal）标题</h4>
                        </div>
                        <div class="modal-body" id="my-info-content${id_str}">在这里添加一些文本</div>
                    </div>
                </div>
            </div>`;
            $("body").append($(modal));
            // 避免点击背景时退出, esc依然退出，不取消右上角关闭按钮
            $("#my-info").modal({backdrop: 'static', keyboard: true});
        }
        $("#my-info-label" + id_str).text(title);
        $("#my-info-content" + id_str).html(content);
        $("#my-info" + id_str).modal('show');
        MyModal.Resize('#my-info' + id_str, width, height);
        MyModal.SetMaxZIndex('#my-info' + id_str);
        return $("#my-info" + id_str);
    }

    static Alert(content, ok_fun = null, width=null, height=null, title='SnippetNotes Info') {
        if($("#my-alert").length < 1){
            let modal = `
            <div class="modal fade" id="my-alert" tabindex="-1" role="dialog" aria-labelledby="my-alert-label" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>
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
            // 避免点击时退出,esc依然退出
            $("#my-alert").modal({backdrop: 'static', keyboard: true});
        }
        $("#my-alert-label").text(title);
        $("#my-alert-content").html(content);

        if(ok_fun){
            $("#my-alert-ok").off("click").click(ok_fun);
        }else{
            $("#my-alert-ok").off("click").click(function(){
                $("#my-alert").modal('hide');
            });
        }
        $("#my-alert").modal('show');
        MyModal.SetMaxZIndex('#my-alert');
        MyModal.Resize('#my-alert',width, height);
    }

    /**
     * 弹出确认模态框
     * @param {*} content 弹框内容
     * @param {*} ok_fun 确定按钮绑定的函数
     * @param {*} cancele_fun 取消按钮绑定的函数
     * @param {*} pre_btn_obj, 额外按钮信息，默认为null，格式为{ text: '按钮文本', fun: function(){...} }
     * @param {*} title 弹框标题
     */
    static Confirm(content, ok_fun=null, cancele_fun=null, pre_btn_obj=null, title='SnippetNotes Confirm') {
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
                            <button type="button" class="btn btn-default" data-dismiss="modal" id="my-confirm-third">待定</button>
                            <button type="button" class="btn btn-default" data-dismiss="modal" id="my-confirm-ok">确定</button>
                            <button type="button" class="btn btn-primary" data-dismiss="modal" id="my-confirm-cancel">取消</button>
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

        // 如果需要在模态框中设置第三个按钮，则设置文本及函数
        if(pre_btn_obj){
            // 显示按钮
            $("#my-confirm-third").show();
            $("#my-confirm-third").text(pre_btn_obj.text);
            $("#my-confirm-third").off("click").click(pre_btn_obj.fun);
        }else{
            // 隐藏按钮my-confirm-third
            $("#my-confirm-third").hide();
        }

        if(ok_fun){
            $("#my-confirm-ok").off("click").click(ok_fun);
        }else{
            $("#my-confirm-ok").off("click").click(function(){
                $("#my-confirm").modal('hide');
            });
        }

        if(cancele_fun){
            $("#my-confirm-cancel").off("click").click(cancele_fun);
        }else{
            $("#my-confirm-cancel").off("click").click(function(){
                $("#my-confirm").modal('hide');
            });
        }

        $("#my-confirm").modal('show')
        MyModal.Resize('#my-confirm');
        MyModal.SetMaxZIndex('#my-confirm');
    }

    static Resize(modal_id, width=null, height=null){
        var $this = $(modal_id);
        var win_height = $(window).height();
        var win_width = $(window).width();
        var modal_dialog = $this.find(".modal-dialog");
        var content = $this.find('.modal-body');
        if(!width){ width = 800; };
        if(!height){ height = 400; };
        modal_dialog.css('width', width);
        content.css('height', height);
        setTimeout(() => {
            // 渲染需要时间，modal_dialog.height()需要延迟计算
            var m_top = ( $(window).height() - modal_dialog.height() ) * 2 / 5;
            modal_dialog.css({'margin': m_top + 'px auto'});
            modal_dialog.css({'max-height': win_height - 100 + 'px', 'max-width': win_width - 100 + 'px'});
        }, 200);
    }
}

// 由于localStorage无法使用，相关功能无效
var MyLocal = class{
    /**
     * 设置本地存储的值
     * @param {*} name 
     * @param {*} obj 
     * @param {*} use_session_storage default false
     */
	static SetJson(name, obj, use_session_storage=false){
        if(use_session_storage){
            sessionStorage.setItem(name, JSON.stringify(obj));
        }else{
            localStorage.setItem(name, JSON.stringify(obj));
        }
	}

    /**
     * 获取本地存储的值
     * @param {*} name 
     * @param {*} use_session_storage default false
     * @returns 
     */
	static GetJson(name, use_session_storage=false){
        if(use_session_storage){
            var v = sessionStorage.getItem(name);
        }else{
            var v = localStorage.getItem(name);
        }
		
		if (v != null){
			return $.parseJSON( v );
		}
		return null;
	}
}

// 由于localStorage无法使用，相关功能无效
var PageData = class {
	/**
	 * 检查select节点是否有值，如果没有并且local key有值则使用对应值进行跳转
     * 要注意处理select节点的值为0及本地数据与session数据不一致的情况，因此一个session只触发一次
	 * @param {*} select_dom_str 
	 * @param {*} jump_url 末尾以=结束，用于拼接值
	 * @param {*} local_key 
	 */
	static ReadSelect(select_dom_str, jump_url, local_key){
		let sel_val = $(select_dom_str).val();
		let local_v = localStorage.getItem(local_key);
        let session_v = sessionStorage.getItem("jump-" + local_key);
		if (!sel_val && (!session_v || session_v <= 2) && local_v){
            sessionStorage.setItem("jump-" + local_key, 1 + Number(session_v));
			JumpTo(jump_url + localStorage.getItem(local_key));
		}
	};


    // 以下系列函数用于绑定input val到sessionStorage 变量
    static _val_from_local_keys = {};
    /**
     * 初始化数据，将 input val绑定到local session变量
     * @param {string} name localStorage变量名
     * @param {string} input_element_id
     */
    static InitValFromLocal(name, input_element){
        this._val_from_local_keys[input_element] = name;
        var val = MyLocal.GetJson(name);
        if(val){
            // 如果input_element为复选框，则设置checked属性
            if($(input_element).attr('type') == 'checkbox'){
                $(input_element).prop('checked', val);
            }else{
                $(input_element).val(val);
            }
        }
    }
    /**
     * 设置新值
     * @param {string} input_element_id 
     */
    static SetValToLocal(input_element){
        var name = this._val_from_local_keys[input_element];
        // 如果input_element为复选框，则读取checked属性
        if($(input_element).attr('type') == 'checkbox'){
            var val = $(input_element).prop('checked');
            MyLocal.SetJson(name, val);
        }else{
            var val = $(input_element).val();
            if(val.length > 1){
                MyLocal.SetJson(name, val);
            }
        }
    }
    // 绑定input val到sessionStorage 变量系列函数结束

    /**
     * 记住页面位置并在刷新时自动加载并跳转
     * @param {string} name 
     */
    static RememberPosition(name){
        let top_val = MyLocal.GetJson(name, true);
        if(top_val){
            PageJump.ScrollTo(Number(top_val), 0);
        }
		$(window).bind('unload', function() {
            MyLocal.SetJson(name, $(document).scrollTop(), true);
		});
    }
}

if(typeof module != "undefined" && typeof module.exports != "undefined"){
    module.exports = { MyDate, MyString };
}