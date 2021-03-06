---
layout: w
title: Linux下的网络I/O模型
date: 2018-11-26 20:40:40
tags: 
- 网络
- Linux
---

在进行网络通信的过程中，接收方在读取数据的时候主要做了两件事情:
1.等待数据准备好(从网络中抵达内核缓冲区)

2.数据从内核缓冲区拷贝到进程的用户缓冲区

## 概念区分

1.同步/异步

在UNP中POSIX的定义是：
- 同步I/O操作导致请求进程阻塞，直到I/O操作完成
- 异步I/O操作不导致请求进程阻塞
在我看来，同步就是发生调用之后等待结果的返回，异步就是不等待结果的返回，继而做别的事情

2.阻塞/非阻塞

阻塞和非阻塞关心的是调用发生之后获取调用结果时的状态。
阻塞是指调用结果返回之前，当前线程挂起，知道结果返回。
非阻塞则不挂起当前线程，采用轮询的方式查看调用结果是否返回。

<!-- more -->

**举个例子**

1.我准备烧一壶水，一直在水壶旁边等水开。(同步阻塞)
2.我把水壶放好之后，就去做自己的事情，每隔一段时间来看看水开了没有(同步非阻塞)
3.这次我用响水壶烧水，水开了之后自动就响，但是我比较傻，担心它不响，一直等水开(异步阻塞)
4.我把响水壶放好之后，就去专心地做自己的事情，知道响水壶响了通知我去拿壶。(异步非阻塞)
显然异步阻塞只是一种理论上的存在。在效率上看，异步显然明显优于同步。

## 网络模型

1.阻塞型IO
![阻塞型网络IO](/pic/阻塞型网络IO.png)

2.非阻塞型IO
![非阻塞型网络IO](/pic/非阻塞型网络IO.png)

这里需要设置套接字的非阻塞选项

- 创建套接字的时候指定 socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK, IPPROTO_TCP)
- linux在一切皆文件  fcntl(sockfd, F_SETFL, fcntl(sockfd, F_GETFL, 0) |O_NONBLOCK）
- ioctl(sockfd, FIONBIO, 1);  //1:非阻塞 0:阻塞

阻塞型IO和非阻塞型IO一般配合多进程或者多线程模型，一个客户端对应一个进程或线程，开销大。

3.IO复用(select、poll、epoll)
![网络IO复用](/pic/网络IO复用.png)

阻塞在IO模型调用函数上，等待对应的套接字的IO操作，可以监控多个套接字。
IO复用一个进程就可以监控多个套接字，但是实现的是伪并发，客户端的请求只能一个一个处理，并且处理流程不宜过程。

4.信号驱动型IO
![信号驱动型IO](/pic/信号驱动型IO.png)

需要开启套接字的信号驱动式I/O功能，通过fcntl将socket和SIGIO关联，当被关联的socket可读或可写的时候，系统触发SIGIO信号。(SIGURG是带外数据可读触发，也需要关联)。fcntl做的事情是为socket指定宿主进程或进程组，被指定的进程或进程组将捕获这两个信号。使用SIGIO时，还需要利用fcntl设置O_ASYNC标志，并且需要准备一个信号捕捉函数，在网络数据抵达内核缓冲区的时候会发出一个SIGIO的信号。

5.异步IO
![](/pic/异步IO.png)

网络数据抵达内核缓冲区的时候，内核再帮我们完成从内核缓冲区到用户缓冲区的拷贝，然后再通知用户。使用aio_read函数给内核传递文件描述符、缓冲区指针、缓冲区大小和文件偏移，并告诉当整个操作完成时如何通知我们(比如通过信号通知)。

## 总结
![](/pic/5种IO模型的比较.png)

前4种IO模型都是同步IO，最后一种才是异步IO。

前4种模型的主要区别在于第一个阶段，因为第二个阶段是一样的，都是recvfrom阻塞从内核缓冲区拷贝到用户缓冲区。异步IO则两个阶段都与前四种不同。

换言之，同步I/O向应用程序通知的是I/O就绪事件，用户需要自己读取数据。

异步I/O向应用程序通知的是I/O完成事件，内核帮用户完成了数据的读写。



