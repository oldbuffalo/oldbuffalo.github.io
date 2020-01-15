---
title: Linux下的select模型
date: 2018-11-28 21:51:24
tags: 
- IO复用
- Linux
- 网络
- Linux高性能服务器编程
---

## 模型特点

1.select能监听的文件描述符个数受限于FD_SETSIZE,一般为1024
2.采用的是轮询的工作原理
3.文件描述符采用fd_set类型管理

<!-- more -->

## 具体使用

**int select(int nfds, fd_set *readfds, fd_set *writefds,fd_set *exceptfds, struct timeval *timeout);**
成功返回就绪的文件描述符个数，失败返回-1并设置errno

阻塞期间，程序收到信号，select立即返回-1，设置errno为EINTR

nfds:通常被设置成select监听的所有文件描述符最大值+1，因为文件描述符从0开始。

为了效率考虑，这个参数会告诉内核检测前多少个文件描述符的状态

readfds:监控有读数据到达文件描述符集合，传入传出参数

writefds：监控写数据到达文件描述符集合，传入传出参数

exceptfds：监控异常发生达文件描述符集合,如带外数据到达异常，传入传出参数

通过这3个参数传入自己感兴趣的文件描述符，select调用返回时，内核将修改它们来通知应用程序哪些文件描述符已经就绪。

timeout：定时阻塞监控时间(微秒)

struct timeval {
　　　long tv_sec;   //seconds 
　　　long tv_usec;   //microseconds
};

3种情况:
- NULL，永远等下去
- 设置timeval，等待固定时间
- 设置timeval里时间均为0，检查描述字后立即返回，轮询。

当然，如果readfds，writefds，exceptfds三个参数都传空，就相当于一个高配版的sleep()

void FD_CLR(int fd, fd_set *set);   把文件描述符集合里fd清0
int FD_ISSET(int fd, fd_set *set);    测试文件描述符集合里fd是否置1
void FD_SET(int fd, fd_set *set);    把文件描述符集合里fd位置1
void FD_ZERO(fd_set *set);            把文件描述符集合里所有位清0

fd_set假设是一个int类型的数组，那么第一个元素就可以监控0-31文件描述符，第二个元素监控32-63，以此类推

现在假设文件描述符3,4,5已经加入readfds

此时3,4就绪，那么select返回值为2，readfds传出3,4

由于readfds是传入传出参数，因此需要准备一个需要监听的fd_set，每次调用select的时候都拷贝给它。

## 文件描述符就绪条件

哪些情况文件描述符被认为可读、可写或者出现异常？

socket可读

- socket内核接收缓存区中的字节数大于或等于其低水位标记SO_RCVLOWAT，此时可以无阻塞读这个socket
- socket通信的对方关闭连接，对socket读操作返回0
- 监听socket上有新的连接请求
- socket上有未处理的错误。此时可以用getsockopt读取和清除该错误

socket可写

- socket内核发送缓存区中的可用字节数大于或等于其低水位标记SO_SNDLOWAT。此时可以无阻塞地写该socket
- socket的写操作被关闭。对写操作被关闭的socket执行写操作将触发一个SIGPIPE信号
- socket使用非阻塞connect连接成功或者失败(超时)之后
- socket上有未处理的错误。此时可以用getsockopt读取和清除该错误

socket出现异常

- socket上接收到带外数据

## 注意点

1.每次调用select都需要给传入的集合重新复制。
2.需要准备一个数据结构保存已连接的socket
3.select第一个参数是文件描述符最大值加1，而不是个数的最大值+1
4.select也可以监控普通的文件描述符，例如标准输入(FILENO_STDIN)，int fileno(File*)

## 优缺点分析

优点：
1.单个进程实现伪并发，易于实现，轻量
2.适合并发量不高，处理流程不长的情况。比如局域网中的某个服务。
3.支持微妙级别的时间精度

缺点:
1.每次都要对传入传出的集合重新拷贝赋值，操作麻烦
2.并发量有1024的上限值
3.采用轮询，随着fd的线性增长，效率呈线性下降
4.实现的是伪并发，对于客户端的请求只能一个一个处理，并且如果处理流程过长，影响用户体验。
5.传入传出参数每次调用select传入时都需要从用户空间拷贝到内核空间，select返回时传出结果从内核拷贝用用户，有着很大的拷贝开销，并且很多时候是重复的工作。

## 服务器代码(客户端代码同多进程模型)

```c
#include<stdio.h>
#include<sys/time.h>
#include<sys/types.h>
#include<sys/socket.h>
#include<string.h>
#include<unistd.h>
#include<stdlib.h>
#include<arpa/inet.h>
#include<ctype.h>
#include<pthread.h>
#include<sys/select.h>

#define IPSIZE 16
#define BUFSIZE 1500
#define CLIENTSOCK_SIZE 1024
#define PORT 1234
#define LISTEN_SIZE 128

int main()
{   


	struct sockaddr_in addr, clientaddr;

	int ListenSock;
	char ip[IPSIZE];

	bzero(&addr,sizeof(addr));

	addr.sin_family = AF_INET;
	addr.sin_addr.s_addr = htonl(INADDR_ANY);
	addr.sin_port = htons(PORT);

	ListenSock = socket(AF_INET,SOCK_STREAM,0);

	if(ListenSock == -1){
		perror("SCOKET CALL FAILED");
		exit(-1);
	}

	if(bind(ListenSock,(struct sockaddr *)&addr,sizeof(addr)) == -1){
		perror("BIND CALL FAILED");
		exit(-1);
	}

    if(listen(ListenSock,LISTEN_SIZE) == -1){
        perror("LISTEN CALL FAILED");
		exit(-1);
    }

	printf("Select Server is Running\n");

	char buf[BUFSIZE];
	fd_set set,oldset;
	int Max,ready,nlen;
	int ClientSockArr[CLIENTSOCK_SIZE];

	//memset(ClientSockArr,-1,sizeof(ClientSockArr));

	for(int i = 0;i<CLIENTSOCK_SIZE;i++)
		ClientSockArr[i] = -1;

	FD_ZERO(&oldset);
	FD_SET(ListenSock,&oldset);

	Max = ListenSock;
	printf("ListenSock:%d\n",ListenSock);
	while(1)
	{
		set = oldset;
		ready = select(Max+1,&set,NULL,NULL,NULL);
		while(ready){
			if(FD_ISSET(ListenSock,&set)){//ListenSock就绪
				int addrsize = sizeof(clientaddr);
				int ClientSock;
				ClientSock = accept(ListenSock,(struct sockaddr* )&clientaddr,&addrsize);
				if(ClientSock == -1)
					perror("ACCEPT ERROR");
				if(ClientSock>0){
					inet_ntop(AF_INET,&clientaddr.sin_addr.s_addr,ip,sizeof(ip));
					printf("IP:%s  Port:%d,ClientSock:%d\n",ip,clientaddr.sin_port,ClientSock);

					//加入到数组当中
					for(int i = 0;i<CLIENTSOCK_SIZE;i++){
						if(ClientSockArr[i] == -1){
							ClientSockArr[i] = ClientSock;
							if(ClientSockArr[i] > Max)
								Max = ClientSockArr[i];
							
							//加入到集合当中
							FD_SET(ClientSockArr[i],&oldset);
							break;
						}
					}

				}

			}
			else{
				//遍历客户端数组找出哪个有事件发生
				for(int i = 0;i<CLIENTSOCK_SIZE;i++){
					if(ClientSockArr[i] != -1){
						if(FD_ISSET(ClientSockArr[i],&set)){ //判断是否就绪
							bzero(buf,sizeof(buf));
							nlen = read(ClientSockArr[i],buf,sizeof(buf));
							if(nlen == 0){ //客户端关闭  这种方式检测客户端终止不好最好心跳机制
								FD_CLR(ClientSockArr[i],&oldset);
								close(ClientSockArr[i]);
								printf("Cilentfd:%d终止\n",ClientSockArr[i]);
								ClientSockArr[i] = -1;
								break;
							}
							
							printf("%s\n",buf);
							for(int j = 0;j<nlen;j++){
								buf[j] = toupper(buf[j]);
							}

							write(ClientSockArr[i],buf,nlen);
							break;
						}

					}
				}

			}
			ready--;
		}

	}

	close(ListenSock);
	return 0;
}
```

[处理带外数据](https://github.com/oldbuffalo/High-performance-Linux-Server-Programming/blob/master/9_chapter/select.cpp)

