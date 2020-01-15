---
title: epoll
date: 2018-12-01 21:52:13
tags: 
- IO复用 
- Linux
- 网络
- Linux高性能服务器编程
---

## 模型特点

1.不同于select和poll,epoll采用回调函数的方式获取文件描述符的就绪状态(主动通知)
2.采用红黑树管理epoll_event结构体
3.内核维护一个就绪队列，只传出就绪的文件描述符
4.有ET(边缘触发)和LT(水平触发)，而select和poll都只有LT
5.同样也突破了select并发量的限制

<!-- more -->

## 具体使用

#### 内核事件表

epoll把用户关心的文件描述符上的事件放在内核里的一个事件表，不同于select、poll每次调用都要重复传入文件描述符集或事件集，因此epoll需要一个额外的文件描述符来唯一标识内核中的这个事件表，这个文件描述符用epoll_create函数来创建。

**int epoll_create(int size)**；

size参数现在不起作用，只是给内核一个提示，告诉它内核事件表需要多大，该函数返回的文件描述符将作用于其他所有epoll系统调用的第一个参数，以指定要访问的内核事件表

**int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event)**

epfd：为epoll_creat的句柄
op：表示动作，用3个宏来表示：

- EPOLL_CTL_ADD(注册新的fd到epfd)
- EPOLL_CTL_MOD(修改已经注册的fd的监听事件)
- EPOLL_CTL_DEL(从epfd删除一个fd)

event：告诉内核需要监听的事件
struct epoll_event{
​　　　　__uint32_t events;    //监控的事件
​　　　　epoll_data_t data;  //用户数据
};
epoll支持的事件类型和poll基本相同，表示epoll事件类型的宏是在poll对应的宏前加上“E”，但epoll有两个额外的事件类型(EPOLLET和EPOLLONESHOT)，这两个宏对于epoll的高效运作很重要。

EPOLLET： 将EPOLL设为边缘触发(Edge Triggered)模式，这是相对于水平触发(Level Triggered)来说的
EPOLLONESHOT：只监听一次事件，当监听完这次事件之后，如果还需要继续监听这个socket的话，需要再次把这个socket加入到EPOLL队列里

typedef union epoll_data {
​　　　　void        *ptr;     //指定与fd相关的用户数据
​　　　　int          fd;
​　　　　uint32_t     u32;
​　　　　uint64_t     u64;
} epoll_data_t;

**int epoll_wait(int epfd, struct epoll_event *events, int maxevents, int timeout)**

成功返回就绪的文件描述符个数，失败返回-1并设置errno

epoll_wait函数如果检测到事件，就将所有就绪的时间从内核事件表中复制到它的第二个参数events指向的数组，这个数组只用于输出epoll_wait检测到的就绪事件，而不像select、poll的数组参数既用于传入用户注册事件，又用于输出内核检测到的就绪事件，这就大大提高了应用程序索引就绪文件描述符的效率。

对于select、poll，需要遍历整个数组找出就绪的文件描述符，然后判断是什么类型的事件发生  O(n)

对于epoll,数组中的所有文件描述符都是就绪的，直接可以判断是什么类型的事件发生  O(1)

## ET和LT

LT是默认的工作模式，这种模式下epoll相当于一个效率较高的poll.
当epoll内核事件表宏注册了一个文件描述符EPOLLET时，采用ET模式
LT：只要一个文件描述符上的事件一次没有处理完，会在以后调用epoll_wait时次次返回就绪
ET：只返回一个就绪，不管处理完还是没有处理完

举个例子:
1.某个客户端向服务器传输了2KB的数据
2.服务器epoll_wait()返回，然后读了1KB
3.两种模式比较

- 如果是LT模式下，下次epoll_wait()还会返回，然后继续读，直到数据被处理完毕
- 如果是ET模式下，下次epoll_wait()会阻塞，因此ET模式只适用于非阻塞的socket，需要循环读取保证所有数据被处理完毕。
- 设置非阻塞 1.socket创建指定选项 2.fcntl 3.iocnlsocket

ET模式很大程序上降低了同一个epoll事件被重复触发的次数，效率更高。但是LT能保证数据读取完整，ET读取数据如果被信号打断，可能读取不全。

对于监听的 sockfd，最好使用水平触发模式，边缘触发模式会导致高并发情况下，有的客户端会连接不上。如果非要使用边缘触发，可以用 while 来循环 accept()。

[ET和LT](https://github.com/oldbuffalo/High-performance-Linux-Server-Programming/blob/master/9_chapter/et_lt.cpp)

#### 为什么ET模式下socket要设置成非阻塞？

如果是阻塞 connfd 的边缘触发，如果不一次性读取一个事件上的数据，会干扰下一个事件，所以必须在读取数据的外部套一层循环，这样才能完整的处理数据。但是外层套循环之后会导致另外一个问题：处理完数据之后，程序会一直卡在 recv() 函数上，因为是阻塞 IO，如果没数据可读，它会一直等在那里，直到有数据可读。但是这个时候，如果用另一个客户端去连接服务器，服务器就不能受理这个新的客户端了。

如果是非阻塞 connfd 的边缘触发，和阻塞版本一样，必须在读取数据的外部套一层循环，这样才能完整的处理数据。因为非阻塞 IO 如果没有数据可读时，会立即返回，并设置 errno。这里我们根据 EAGAIN 和EWOULDBLOCK 来判断数据是否全部读取完毕了，如果读取完毕，就会正常退出循环了。

## EPOLLONESHOT (Linux高性能服务器编程P157)

即使我们使用ET模式，那一个socket上的事件也有可能被触发多次，这在并发程序中会引起一个问题。比如一个线程读取socket上的数据后开始处理这些数据，而在数据的处理过程中该socket上又有新数据可读，此时另外一个线程来读取这些数据，于是就出现了两个线程同时操作一个socket的情况。而我们期望一个socket连接在任意时刻都只被一个线程处理，这一点我们可以用EPOLLONESHOT事件实现。

对于注册了EPOLLONESHOT事件的文件描述符，操作系统最多触发其注册的读、写、异常中的一个，并且只触发一次，除非重新用epoll_ctl重置该文件描述符的EPOLLONESHOT事件。因此，每次处理完都需要立即重置这个socket上的EPOLLONESHOT事件，以确保这个socket下一次可读时，EPOLLIN能被触发。

**注意：监听socket上不能注册EPOLLONESHOT，否则只能处理一个客户端的连接**

[EPOLLONESHOT](https://github.com/oldbuffalo/High-performance-Linux-Server-Programming/blob/master/9_chapter/epoll_oneshot.cpp)

#### 对于EPOLLOUT事件的一些理解

在一次发送大量数据（超过发送缓冲区大小）的情况下，如果使用阻塞方式，程序一直阻塞，直到所有的数据都写入到缓冲区中。例如，要发送M字节数据，套接字发送缓冲区大小为B字节，只有当对端向本机返回ack表明其接收到大于等于M-B字节时，才意味着所有的数据都写入到缓冲区中。很明显，如果一次发送的数据量非常大，比如M=10GB、B=64KB，则：1）一次发送过程中本机线程会在一个fd上阻塞相当长一段时间，其他fd得不到及时处理；2）如果出现发送失败，无从得知到底有多少数据发送成功，应用程序只能选择重新发送这10G数据，结合考虑网络的稳定性，只能呵呵；
总之，上述两点都是无法接受的。因此，对性能有要求的服务器一般不采用阻塞而采用非阻塞。

采用非阻塞套接字一次发送大量数据的流程：

- 1.使劲往发送缓冲区中写数据，直到返回不可写

- 2.等待下一次缓冲区可写

- 3.要发送的数据写完

  其中2可以有两种方式

  - 查询式，程序不停地查询是否可写
  - 程序去干其他的事情（多路分离器的优在），等出现可写事件后再接着写；很明显方式b）更加优雅

例如需要将一个10G大小的文件返回给用户，那么简单send这个文件是不会成功的。
这个场景下，send 10G的数据，send返回值不会是10G，而是大约256k，表示你只成功写入了256k的数据。接着调用send，send就会返回EAGAIN，告诉你socket的缓冲区已经满了，此时无法继续send,需要重新注册EPOLLOUT事件，进行新一轮的监听。
此时异步程序的正确处理流程是调用epoll_wait，当socket缓冲区中的数据被对方接收之后，缓冲区就会有空闲空间可以继续接收数据，此时epoll_wait就会返回这个socket的EPOLLOUT事件，获得这个事件时，你就可以继续往socket中写出数据。

EPOLLOUT事件就是以事件的方式通知用户程序，可以继续往缓冲区写数据了。

## 优缺点分析

缺点：
1.在高并发高活跃的情况下，对内部树进行频繁的操作，效率可能不如select和poll
2.实现的是伪并发，对于客户端的请求只能一个一个处理，并且如果处理流程过长，影响用户体验。

优点:
1.非常适用于高并发低活跃的情况下
2.采用回调函数的方式传出fd，高效
3.直接传出就绪的文件描述符，减少了索引就绪文件描述符的时间

4.真正突破了文件描述符的限制，不采用轮询，不会因为fd数量的增长而导致效率下降
5.有ET工作模型和EPOLLONESHOT，进一步提升了工作效率

## LT工作模型下的服务器(客户端同多进程模型)

```
#include<stdio.h>
#include<ctype.h>
#include<string.h>
#include<unistd.h>
#include<sys/types.h>
#include<sys/socket.h>
#include<stdlib.h>
#include<string.h>
#include<sys/epoll.h>
#include<arpa/inet.h>

#define PORT       1234
#define LISTEN     128
#define IP         16
#define BUFSIZE    1500
#define MAXSIZE    200000

int main()
{
	struct sockaddr_in addr,clientaddr;
	char ip[IP] = {0};
	bzero(&addr,sizeof(addr));

	addr.sin_family = AF_INET;
	addr.sin_addr.s_addr = htonl(INADDR_ANY);
	addr.sin_port = htons(PORT)	;

	
	int Serverfd;
	Serverfd = socket(AF_INET,SOCK_STREAM,0);
	if(Serverfd  == -1){
		perror("Socket Create Faile");
		exit(-1);
	}
	printf("Serverfd:%d\n",Serverfd);
	if(-1 == bind(Serverfd,(struct sockaddr*)&addr,sizeof(addr))){
		perror("BIND ERROR");
		exit(-1);
	}

	if(-1 == listen(Serverfd,LISTEN)){
		perror("LISTEN ERROR");
		exit(-1);
	}

	printf("epoll Server is running\n");

	struct epoll_event ent[MAXSIZE];
	struct epoll_event tmp;
	int epfd,ready,nlen;
	char buf[BUFSIZE];
	

	for(int i = 0;i<MAXSIZE;i++){
		ent[i].data.fd = -1;
	}

	epfd = epoll_create(MAXSIZE);    //红黑树

	tmp.data.fd = Serverfd;
	tmp.events = EPOLLIN;
	
	epoll_ctl(epfd,EPOLL_CTL_ADD,Serverfd,&tmp);
	
	while(1){
		ready = epoll_wait(epfd,ent,MAXSIZE,-1);
		
		while(ready){
			if(ent[--ready].data.fd == Serverfd){
				int Clientfd;
				int nlen = sizeof(clientaddr);
				Clientfd = accept(Serverfd,(struct sockaddr*)&clientaddr,&nlen);
				if(Clientfd == -1){
					perror("Accpet Error");
					exit(-1);
				}
				else{
					inet_ntop(AF_INET,&clientaddr.sin_addr.s_addr,ip,sizeof(ip));
					printf("IP:%s Port:%d Clientfd:%d\n",ip,clientaddr.sin_port,Clientfd);
					
					tmp.data.fd = Clientfd;
					tmp.events = EPOLLIN;

					epoll_ctl(epfd,EPOLL_CTL_ADD,Clientfd,&tmp);
				}

			}
			else{
				if(ent[ready].data.fd != -1){
					nlen = read(ent[ready].data.fd,buf,sizeof(buf));

					if(0 == nlen){
						epoll_ctl(epfd,EPOLL_CTL_DEL,ent[ready].data.fd,NULL);
						close(ent[ready].data.fd);
						printf("Clientfd:%d客户端终止\n",ent[ready].data.fd);
						ent[ready].data.fd = -1;
					}
					else{
						for(int i = 0;i<nlen;i++){
							buf[i] =toupper(buf[i]);
						}
						write(ent[ready].data.fd,buf,nlen);
					}
				}

			}
		}


	}

	close(Serverfd);

	return 0;
}
```



