---
title: poll
date: 2018-11-30 21:51:59
tags: 
- IO复用
- Linux
- 网络
- Linux高性能服务器编程
---

## 模型特点

1.和select类似，但是突破了并发量的限制。
2.采用的依旧是轮询
3.采用struct pollfd结构体记录fd的状态

<!-- more -->

## 具体使用

**int poll(struct pollfd *fds, nfds_t nfds, int timeout);**

成功返回就绪的文件描述符个数，失败返回-1并设置errno
fds:结构体数组首地址
nfds:数组元素个数
timeout：3种情况

- -1 永远等待

- 0     立即返回
- 大于0  等待指定数目的毫秒数

struct pollfd {
​　　　int fd;  //文件描述符
​　　　short events; //监控的事件
​　　　short revents; //监控事件中满足条件返回的事件
};

![](/pic/poll事件表.png)

如果不再监控某个文件描述符时，可以把pollfd中的fd设置为-1，poll不再监控此fd,该pollfd中的revents返回0

每次poll调用都会自动把上次的revents清空

## 优缺点分析

优点:
1.突破了select并发量的限制，但是需要设置进程最大打开的文件描述符个数
2.做到了传入传出分离，更易于操作

缺点：
1.采用轮询，随着fd的线性增长，效率呈线性下降
2.实现的是伪并发，对于客户端的请求只能一个一个处理，并且如果处理流程过长，影响用户体验。
3.每次调用poll传入时都需要从用户空间拷贝到内核空间，poll返回时传出结果从内核拷贝用用户，有着很大的拷贝开销，并且很多时候是重复的工作。

4.只支持毫秒级别的精度

## 注意点:

1.在我的虚拟机上Ubuntu16.04一个进程默认的最大打开文件描述符是1024，为了实现poll的高并发需要自己修改这个值。[修改文件描述符个数方法](https://blog.csdn.net/hellozpc/article/details/47952867)

2.在判断对应的事件是否发生的时候用位与操作。

- 为什么不用相等？加入我注册的事件是POLLIN(这是POLLRDNORM|POLLRDBAND)，这时候POLLRDNORM触发了，如果是相等就不对了。

3.应用程序需要根据recv调用的返回值来区分socket上接收到的是有效数据还是对方关闭连接的请求，并做相应的处理。自Linux内核2.6.17开始，GNU为poll增加了一个POLLRDHUP事件，它在socket上接收到对方关闭连接的请求之后触发，这为区分上述的两种情况提供了一种就简便方法。但在使用POLLRDHUP事件的时候，需要在代码最开始定义_GNU_SOURCE。

4.poll在事件触发之后，要对revent进行清空操作。

poll聊天室练习

[客户端](https://github.com/oldbuffalo/High-performance-Linux-Server-Programming/blob/master/9_chapter/chat_client.cpp)

[服务器](https://github.com/oldbuffalo/High-performance-Linux-Server-Programming/blob/master/9_chapter/chat_server.cpp)

## 服务器代码(客户端代码同多进程模型)

```
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
#include<poll.h>


#define IPSIZE 16
#define BUFSIZE 1500
#define POLLFD_SIZE 1500
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

	printf("Poll Server is Running\n");

	char buf[BUFSIZE];
	int ready,nlen;
	struct pollfd PollArr[POLLFD_SIZE];

	//memset(ClientSockArr,-1,sizeof(ClientSockArr));

	for(int i = 0;i<POLLFD_SIZE;i++)
		PollArr[i].fd = -1;	
	
	PollArr[0].fd = ListenSock;
	PollArr[0].events = POLLIN;

	while(1){
		ready = poll(PollArr,POLLFD_SIZE,-1);
		if(ready == -1){
			perror("POLL Filed");
			exit(-1);
		}
		while(ready){
			if(PollArr[0].revents & POLLIN){//ListenSock就绪
				int addrsize = sizeof(clientaddr);
				int ClientSock;
				ClientSock = accept(ListenSock,(struct sockaddr* )&clientaddr,&addrsize);
				if(ClientSock == -1)
					perror("ACCEPT ERROR");
				if(ClientSock>0){
					inet_ntop(AF_INET,&clientaddr.sin_addr.s_addr,ip,sizeof(ip));
					printf("IP:%s  Port:%d ClientSock:%d\n",ip,clientaddr.sin_port,ClientSock);

					//加入到数组当中
					for(int i = 1;i<POLLFD_SIZE;i++){
						if(PollArr[i].fd == -1){
							PollArr[i].fd = ClientSock;
							PollArr[i].events = POLLIN;
							break;
						}
					}

				}

			}
			else{
				//遍历客户端数组找出哪个有事件发生
				for(int i = 1;i<POLLFD_SIZE;i++){
					if(PollArr[i].fd != -1){
						if(PollArr[i].revents & POLLIN ){ //判断是否就绪

							nlen = read(PollArr[i].fd,buf,sizeof(buf));
							if(nlen == 0) {//客户端关闭
								close(PollArr[i].fd);
								printf("ClientSock:%d断开连接\n",PollArr[i].fd);
								PollArr[i].fd = -1;
								break;
							}

							for(int j = 0;j<nlen;j++){
								buf[j] = toupper(buf[j]);
							}

							write(PollArr[i].fd,buf,nlen);
							
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

