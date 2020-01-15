---
title: gdb调试
date: 2019-04-20 15:50:10
tags:
- 常用工具
- Linux高性能服务器编程
---

gdb是一个文件界面的调试工具，但是功能很强大。

通过实战来熟悉一下常用操作。

首先需要注意的是如果要用gdb调试，在编译的时候需要加上-g选项

<!--more-->

## 调试最基础的swap程序







## gdb调试多进程程序

- 单独调试子进程(attach)

调试用例程序：[进程池实现的CGI服务器](https://github.com/oldbuffalo/High-performance-Linux-Server-Programming/blob/master/15_chapter/CGI_server.cpp)

首先启动服务器

![](/pic/CGI调试1.png)

然后输入gdb启动gdb调试器，然后输入attach 子进程pid

一开始attach失败了

![](/pic/CGI调试2.png)

根据错误信息的提示然后查阅资料，得知是内核参数/proc/sys/kernel/yama/ptrace_scope的原因

要设置成0，才能attach成功。

因此，采用临时修改的方式

```
echo 0 | sudo tee /proc/sys/kernel/yama/ptrace_scope
```

当然也可以在/etc/sysctl.d/10-ptrace.conf中修改从而永久有效

```
kernel.yama.ptrace_scope = 0
```

![](/pic/CGI调试3.png)

下一步设置断点

![](/pic/CGI调试4.png)

接下来在另一个终端使用telnet 127.0.0.1 12345来连接服务器并发送一些数据，调试器就在断点处暂停了，并且使用bt查看堆栈调用。

![](/pic/CGI调试5.png)

- 使用调试器选项follow-fork-mode

gdb调试器的选项follow-fork-mode允许我们选择程序执行fork系统调用后是继续调试父进程还是调试子进程。

```
set follow-fork-mode mode(parent/child)
```

还是使用上面的CGI程序进行调试，但是不同的是启动gdb调试的时候需要  gdb +程序文件名

![](/pic/CGI调试6.png)

接下来在另一个终端使用telnet 127.0.0.1 12345来连接服务器并发送一些数据，调试器就在断点处暂停了，并且使用bt查看堆栈调用。

![](/pic/CGI调试7.png)

## gdb调试多线程程序

gdb有一组命令可辅助多线程程序的调试

- info threads,显示当前可调试的所有线程.gdb会为每个线程分配一个ID，可以使用这个ID来操作对应的线程。ID前面有"*"号的线程是当前被调试的线程
- thread ID,调试目标ID指定的线程
- set scheduler-locking[off|on|step]。调试多线程程序时，默认除了被调试的线程在执行外，其他线程也继续执行。但有的时候我们希望只让被调试的线程运行，这可以通过这个命令实现。
  - off表示不锁定任何线程，即所有线程都可以继续执行，这是默认值
  - on表示只有当前被调试的线程会继续执行
  - step表示在单步执行的时候，只有当前线程会执行

调试用例程序：[多线程Web服务器](https://github.com/oldbuffalo/High-performance-Linux-Server-Programming/tree/master/15_chapter/Web_server)

分别设置父线程中的断点和子线程中的断点，然后启动程序

![](/pic/Web调试1.png)

然后在另一个终端使用telnet 127.0.0.1 12345来连接服务器并发送一些数据，调试器就在预期的断点处暂停了。并且查看线程信息，发现当前被调试的是主线程，ID是1

![](/pic/Web调试2.png)

紧接着设置scheduler-locking值为on，让其他线程不执行，锁定调试对象，然后逐步执行,最终重新阻塞在epoll_wait上，然后按crtl+C结束主线程

![](/pic/Web调试3.png)

然后切换到子线程进行调试，其ID为2

![](/pic/Web调试4.png)

这里用到了一个技巧，就是先将线程池创建的线程个数减少到1，来观察程序的逻辑是否正确，然后再逐步增加线程的数量进行调试。