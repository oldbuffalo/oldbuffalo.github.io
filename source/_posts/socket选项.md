---
title: socket选项
date: 2019-03-13 17:15:03
tags:
- 网络
- Linux高性能服务器编程
---

socket文件描述符本质上也是文件，可以用fcntl系统调用来控制文件描述符属性(通用POSIX方法)

专门操作socket文件描述符属性的函数：

int getsockopt(int sockfd,int level,int option_name,void* option_value,socklen_t* restrict option_len);

int setsockopt(int sockfd,int level,int option_name,const void* option_value,socklen_t option_len);

level:操作那个协议  IPv4/IPv6/TCP...

<!--more-->

常用的选项：

![](/pic/socket选项.png)

需要注意的是：对服务器而言，有部分socket选项只能来listen调用前针对监听socket设置才有效。比如TCP_MAXSEG选项，代表TCP最大报文段大小，该选项只能由同步报文段来发送。accept从listen监听队列中接收的连接至少是TCP_RECV状态，也就是服务器已经给接收连接端发送了同步报文段，如果TCP_MAXSEG选项在这之后设置，就不起作用了。对客户端而言，这些选项要在connect之前设置。

解决方案：对监听socket设置这些socket选项，那么accept返回的连接socket将自动继承这些选项。

这些选项包括：SO_DEBUG、SO_DONTROUTE、SO_KEEPLIVE、SO_LINGER、SO_OOBINLINE、SO_RCVBUF、SO_RCVLOWAT、SO_SNFBUF、SO_SNDLOWAT、TCP_MAXSEG、TCP_NODELAY。

## SO_REUSEADDR选项

服务器可以通过设置socket选项SO_REUSERADDR来强制使用处于TIME_WAIT状态的连接占用的socket地址。

```
int sockfd = socket(AF_INET,SOCK_STREAM,0);
assert(sockfd >= 0);
int reuse = 1;
setsockopt(sockfd,SOL_SOCKET,SO_REUSEADDR,&reuse,sizeof(reuse));
```

此外，也可以通过改变内核参数/proc/sys/net/ipv4/tcp_tw_recycle来快速回收被关闭的socket

0表示禁用，1表示开启

## SO_RCVBUF和SO_SNDBUF

分别表示TCP接受缓冲区和发送缓冲区的大小。

用setsockopt选项设置TCP的接收缓冲区和发送缓冲区的大小时，系统会将其值加倍，并且不得小于某个最小值。

下面编写修改发送缓冲区和接收缓冲区的程序。[客户端](https://github.com/oldbuffalo/High-performance-Linux-Server-Programming/blob/master/5_chapter/5_10.cpp) [服务器](https://github.com/oldbuffalo/High-performance-Linux-Server-Programming/blob/master/5_chapter/5_11.cpp)

服务器输出：

![](/pic/SO_RCVBUF.png)

改变输入参数：

![](/pic/SO_RCVBUF.png)

客户端输出：

![](/pic/SNDBUF.png)

改变输入参数：

![](/pic/SNDBUF1.png)

从服务器的输出可见，系统会将设置的接收缓冲区的值翻倍，但是如果翻倍的值不足系统默认的最小值，我的机器(Ubuntu16.04)默认2240字节，系统就设置成2240字节。

从客户端的输出可见，系统会将设置的发送缓冲区的值翻倍，但是如果翻倍的值不足系统默认的最小值，系统就设置成4480字节。

## SO_LINGER选项

用来控制close系统调用在关闭TCP连接时的行为。

设置SO_LINGER选项的值时，需要给setsockopt(getsockopt)系统调用传递一个linger类型的结构体

```
struct linger{
	int l_onoff;    //开启(非0)还是关闭(0)该选项
    int l_linger;   //滞留时间
};
```

根据linger结构体两个成员变量的不同值，close系统调用可能产生如下3种行为：

- l_onoff = 0。SO_LINGER不起作用。close采用默认行为关闭socket。

​        默认行为：立即返回，TCP模块负责把该socket对应的TCP发送缓冲区中残留的数据发送给对方

- l_onoff !=0,l_linger = 0。close立即返回，TCP模块将丢弃被关闭的socket对杨的TCP发送缓冲区中残留的数据，同时给对方发送一个复位报文段。因此，这种情况给服务器提供了异常终止一个连接的方法。

- l_onoff != 0,l_linger > 0。此时close的行为取决于1.被关闭的socket对应的TCP发送缓冲区中是否有残留的数据。2.该socket是阻塞的，还是非阻塞的。

  对于阻塞的socket，close将等待一段长为l_linger的时间，直到TCP模块发送完所有残留数据并得到对方的确认。如果这段时间内TCP模块没有发送完残留数据并得到对方的确认，close返回-1并设置errno为EWOULDBLOCK。

  对于非阻塞的socket，close将立即返回，此时需要根据其返回值和errno来判断残留数据是否已经发送完毕。