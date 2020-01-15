---
title: 网络中一些高级I/O函数
date: 2019-03-24 20:44:57
tags:
- 网络
- Linux高性能服务器编程
---

跟着游双老师的《Linux高性能服务器编程》第六章敲了一些demon

理解了一些特殊场合使用的函数

## dup和dup2

用来创建一个文件描述符，一般用来重定向

CGI服务器原理：把标准输入重定向到一个网络连接

```
int dup(int file_descriptor)
int dup2(int file_descriptor_one,int file_descriptor_two)
```

dup函数创建一个新的文件描述符，新的fd和原有文件描述符file_descriptor指向同一个文件，dup返回系统当前可用的最小的整数值。

<!--more-->

dup2和dup类似，不过它返回第一个不小于file_descriptor_two的整数值。

注意点：dup和dup2创建的文件描述符不继承原文件描述符的属性，如close-on-exec和no-blocking等

[CGI服务器原理代码](https://github.com/oldbuffalo/High-performance-Linux-Server-Programming/blob/master/6_chapter/cgi_server.cpp)

##  readv和writev

readv:将数据从文件描述符读到分散的内存块中，分散读

writev:将多块分散的内存书籍怒一并写入文件描述符中，几种写

```
ssize_t readv(int fd,const struct iovec* vector,int count);
ssize_t writev(int fd,const struct iovec* vector,int count);

struct iovect{
    void* iov_base; //内存起始地址
    size_t iov_len; //这块内存的长度
};
```

这两个函数相当于简易版的recvmsg和sendmsg。

对于web服务器，在收到一个HTTP请求之后，解析请求，需要回复一个HTTP应答(应答头+请求资源)给用户，可能HTTP应答放在一块内存中，而资源的内容被读入到另一块内存中，并不需要把这两部分内容拼接到一起再发送，而是可以借助writev将它们同时写出。

[web服务器上的集中写](https://github.com/oldbuffalo/High-performance-Linux-Server-Programming/blob/master/6_chapter/web%E6%9C%8D%E5%8A%A1%E5%99%A8%E9%9B%86%E4%B8%AD%E5%86%99.cpp)

## sendfile

该函数在两个文件描述符中直接传递数据，完全在内核中操作，避免了内核缓冲区到用户缓冲区之间的数据拷贝，效率高，也叫零拷贝。

```
ssize_t sendfile（int out_fd,int in_fd,off_t* offset,size_t count）；
```

out_fd:待写入内容的文件描述符,**必须是一个socket**

in_fd:待读出内容的文件描述符,**必须指向真是的文件，不能是socket和管道**

offset:从读入文件流的哪个位置开始读，如果是NULL，默认从起始位置。

因此，sendfile是专门为网络上传输文件设计的。

[sendfile传输文件](https://github.com/oldbuffalo/High-performance-Linux-Server-Programming/blob/master/6_chapter/sendfile.cpp)

## splice

用于在两个文件描述符之间移动数据，也是零拷贝操作

```
ssize_t splice(int fd_in,loff_t* off_in,int fd_out,loff_t* off_out,size_t len,unsigned int flags)
```

fd_in:带输入数据的文件描述符。如果fd_in是管道文件，off_in必须是NULL

off_in:如果fd_in不是管道文件，该参数表示从输入数据流的何处开始读取位置，如果是NULL，表示从输入数据流的当前偏移位置读入。

flags参数：

![](/pic/splice函数flag参数.png)

**注意：fd_in和fd_out中至少有一个是管道文件描述符**

[使用splice实现的echo服务器](https://github.com/oldbuffalo/High-performance-Linux-Server-Programming/blob/master/6_chapter/splice.cpp)

## tee 

在两个**管道文件描述符**之间复制数据，也是零拷贝操作。不消耗数据，因此源文件描述符上的数据仍然可以用于后续操作。

```
ssize_t tee(int fd_in,int fd_out,size_t len,unsigned int flags)
```

参数含义和splice一样。

**注意：fd_in和fd_out必须都是管道文件描述符**

[利用tee实现同时输出数据到终端和文件](https://github.com/oldbuffalo/High-performance-Linux-Server-Programming/blob/master/6_chapter/tee.cpp)

