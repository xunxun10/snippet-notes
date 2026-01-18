// electron-api.d.ts

// 扩展原生的 Window 接口
export {}; // 确保文件是模块

declare global {
  interface Window {
    // 关键：在这里声明 electronAPI 的类型
    electronAPI: {
        OnBgErrorMsg: (callback: (msg: string) => void) => void;
        OnSysCall: (callback: (msg: string) => void) => void;
      // 根据你 preload.js 中暴露的具体方法进行定义

    };
  }

  // 根据 util/my_util.js 实际实现修正 MyModal 声明
  interface MyModal {
    /**
     * 展示警告信息模态框
     * @param content 模态框内容
     * @param ok_fun 确定按钮点击事件回调函数
     * @param width 模态框宽度
     * @param height 模态框高度
     * @param title 模态框标题
     */
    Alert(
      content: string,
      ok_fun?: (() => void) | null,
      width?: number | null,
      height?: number | null,
      title?: string
    ): void;

    /**
     * 展示信息及关闭按钮
     * @param content 模态框内容
     * @param title 模态框标题
     * @param width 模态框宽度
     * @param height 模态框高度
     * @param id_str 用于指定 modal 的额外 id 标识
     * @returns jQuery 对象
     */
    Info(
      content: string,
      title?: string,
      width?: number,
      height?: number,
      id_str?: string
    ): any;

    /**
     * 弹出确认模态框
     * @param content 弹框内容
     * @param ok_fun 确定按钮点击事件回调函数
     * @param cancele_fun 取消按钮点击事件回调函数
     * @param pre_btn_obj 预置按钮对象，包含text及fun属性
     * @param title 弹框标题
     * @param width 模态框宽度
     * @param height 模态框高度
     */
    Confirm(
      content: string,
      ok_fun?: (() => void) | null,
      cancele_fun?: (() => void) | null,
      pre_btn_obj?: { text: string; fun: () => void } | null,
      title?: string,
      width?: number,
      height?: number
    ): void;

    /**
     * 调整模态框大小
     * @param modal_id 模态框的选择器
     * @param width 宽度，数字
     * @param height 高度，数字
     */
    Resize(modal_id: string, width?: number | null, height?: number | null): void;

    /**
     * 设置模态框的 z-index 为当前所有模态框最大值 +1
     * @param modal_id 模态框的选择器
     */
    SetMaxZIndex(modal_id: string): void;
  }
  // 将 MyModal 声明为全局变量
  var MyModal: MyModal;
}