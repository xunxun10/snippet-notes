# snippet-notes

## 简介

效能笔记（Snippet Notes）是一款开源免费的本地笔记记录软件,与同类型笔记相比,对搜索及速记能力进行了着重优化。[ Snippet Notes is an open source and free local note-taking software, optimized for search and shorthand capabilities compared to similar types of notes tool.]

软件基于electron开发，遵循MIT开源协议。


## 使用

对笔记进行快速记录，第一行将作为笔记名，如果笔记以#开头则将默认以markdown格式进行渲染及编辑。支持创建多个笔记，也可以直接把内容都记录到一个笔记中，对整体体验影响不大。

![edit](help/img/edit.png) 

使用快捷键 Ctrl + f触发搜索，通过正则及lunr.js对关键字进行全文检索，同一个笔记中的每一个匹配数据都将单独展示，大部分情况下可直接在搜索界面获得想要的数据，双击搜索结果可进入详情页，双击详情页可进入对内容进行编辑。

![search](help/img/search.png)  


## 安装说明

推荐直接使用绿色版程序压缩包，解压即用。当使用安装程序进行安装时会被360安全卫士误告警 “有程序试图修改应用关键程序及DLL”，告警的提示中可见修改的都是本软件自己的库及文件，忽略即可。


## 编译
```
npm run dist
```

## 鸣谢

- electron
- sqlite3
- jquery
- vditor
- lunr
- nodejieba

其他使用的开源社区产品参见 lib 及 package.json 的引用信息