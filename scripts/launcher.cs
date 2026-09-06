// snippet-note-md.exe: md文件轻量转发程序
// 自身嵌入md专属图标（由打包脚本 afterPack.js 以 /win32icon 编译注入），
// 仅负责携带参数拉起同目录的主程序 snippet-note.exe，自身随即退出。
// 用途：将md文件默认打开方式指向本程序，资源管理器中md文件即显示本程序嵌入的
// md专属图标（而非主程序图标）；双击md -> 本程序转发 -> 主程序以文件模式打开。
// 注意：使用系统自带 .NET Framework csc 编译，语法须兼容 C# 5。

using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

static class Launcher
{
    [STAThread]
    static void Main(string[] args)
    {
        try
        {
            string dir = AppDomain.CurrentDomain.BaseDirectory;
            string exe = Path.Combine(dir, "snippet-note.exe");
            if (!File.Exists(exe))
            {
                MessageBox.Show("未找到主程序: " + exe, "snippet-note-md",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            // 无参数时等同双击主程序（进入笔记模式）；有参数（md路径）时逐个加引号转发，路径含空格不被拆断
            string argv = string.Join(" ", Array.ConvertAll(args, a => "\"" + a + "\""));
            Process.Start(new ProcessStartInfo
            {
                FileName = exe,
                Arguments = argv,
                WorkingDirectory = dir
            });
        }
        catch (Exception e)
        {
            MessageBox.Show("启动主程序失败: " + e.Message, "snippet-note-md",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
