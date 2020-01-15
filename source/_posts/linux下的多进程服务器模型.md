---
title: linux下的多进程服务器模型
date: 2018-11-27 21:42:24
tags: 
- 服务器模型
- 进程
- Linux
---

## 整体思路

服务器端完成的工作是将客户端传来的字符串，小写变大写，再返回给客户端
父进程负责accept，每来一个connect就fork出一个子进程专门处理对应客户端的请求。

## 需要注意的问题
1.fork子进程的时候继承父进程的文件描述符，需要关闭。
2.客户端退出之后，对应的子进程也就终止，需要回收子进程。
3.在回收子进程的过程中，利用信号捕捉SIGCHLD。在执行信号捕捉函数的时候，会导致accept调用失败。
4.在多个子进程同时退出的时候，需要用waitpid循环回收。
5.创建一根线程专门回收的时候，需要在主线程对SIGCHLD信号设置屏蔽字

<!-- more -->

## 服务器端代码

```c
#include<stdio.h>
#include<sys/types.h>
#include<sys/socket.h>
#include<string.h>
#include<unistd.h>
#include<stdlib.h>
#include<arpa/inet.h>
#include<ctype.h>
#include<pthread.h>
#include<sys/wait.h>
#include<signal.h>

void mywait(int n)
{
	pid_t wpid;
	while((wpid = waitpid(-1,NULL,WNOHANG)) > 0){
		printf("pid为%d的进程被回收\n",wpid);
	}
}


void* jobs(void* argv)
{
	//捕捉信号   异步回收
	pthread_detach(pthread_self());
	struct sigaction act,oldact;
	act.sa_handler = mywait;
	act.sa_flags = 0;
	sigemptyset(&act.sa_mask);

	sigaction(SIGCHLD,&act,&oldact);

	while(1)
		sleep(1);
}


int main()
{
	struct sockaddr_in clientaddr;
	int addrsize;
	int ListenSock,ClientSock;
	char ip[16];
	struct sockaddr_in addr;
	bzero(&addr,sizeof(addr));
	addr.sin_family = AF_INET;
	addr.sin_addr.s_addr = htonl(INADDR_ANY);
	addr.sin_port = htons(1234);

	ListenSock = socket(AF_INET,SOCK_STREAM,0);

	if(ListenSock == -1){
		perror("SCOKET CALL FAILED");
		exit(-1);
	}

	if(bind(ListenSock,(struct sockaddr *)&addr,sizeof(addr)) == -1){
		perror("BIND CALL FAILED");
		exit(-1);
	}

	if(listen(ListenSock,128) == -1){
        perror("LISTEN CALL FAILED");
		exit(-1);
	}

	printf("Server is Running\n");
	char buf[100];
	bzero(buf,sizeof(buf));
	pthread_t tid;
	pthread_create(&tid,NULL,jobs,NULL);   //创建一个线程回收

    sigset_t set,oldset;
    sigemptyset(&set);
    sigaddset(&set,SIGCHLD);
 	sigprocmask(SIG_BLOCK,&set,&oldset);
	
	int nRes;
	pid_t pid;
	while(1){
		addrsize = sizeof(clientaddr);
		ClientSock= accept(ListenSock,(struct sockaddr* )&clientaddr,&addrsize);
		if(ClientSock < 0){
			perror("ACCEPT ERROR");
			exit(-1);
		}
		pid = fork();
		//父进程
		if(pid > 0){
			inet_ntop(AF_INET,&clientaddr.sin_addr.s_addr,ip,sizeof(ip));
			printf("IP:%s  Port:%d\n",ip,clientaddr.sin_port);
			close(ClientSock);
		}
		//子进程
		else if(pid == 0){
			close(ListenSock);
			while(1){
				nRes = read(ClientSock,buf,sizeof(buf));
				if(nRes < 0){
					perror("READ ERROR");
					exit(0);
				}
				else if(nRes == 0){//客户端写端关闭   read返回值为0 这个进程终止
					close(ClientSock);
					exit(-1);
				}
				//大小写转换
				for(int i = 0;i<nRes;i++){
					buf[i] = toupper(buf[i]);
				}
				write(ClientSock,buf,nRes);
				bzero(buf,sizeof(buf));
			}

		}
		else{
			perror("FORK CALL FAILED");
			exit(-1);
		}
	}

	close(ListenSock);
	return 0;
}
```

#### 客户端代码

```c
#include<stdio.h>
#include<sys/types.h>
#include<sys/socket.h>
#include<string.h>
#include<unistd.h>
#include<stdlib.h>
#include<arpa/inet.h>


#define SERVER_IP "127.0.0.1"
#define PORT 1234

int main()
{
	struct sockaddr_in addr;
	bzero(&addr,sizeof(addr));
	addr.sin_family = AF_INET;
	inet_pton(AF_INET,SERVER_IP,&addr.sin_addr.s_addr);
	addr.sin_port = htons(PORT);

	int ClientSock;
	ClientSock = socket(AF_INET,SOCK_STREAM,0);

	if(ClientSock == -1)
	{
		perror("SCOKET CALL FAILED");
		exit(-1);
	}


	if(-1 == connect(ClientSock,(struct sockaddr*)&addr,sizeof(addr)))
	{
		perror("CONNECT CALL FAILED");
		exit(-1);
	}
	char buf[100];
	//scanf("%s",buf);
	int nRes;
	while(1)
	{
		fgets(buf,sizeof(buf),stdin);
		//send(ClientSock,buf,sizeof(buf),0);
		write(ClientSock,buf,sizeof(buf));

		nRes = read(ClientSock,buf,sizeof(buf));
		if(nRes > 0)
		{
			printf("%s",buf);
		}
		bzero(buf,sizeof(buf));
	}
	close(ClientSock);

	return 0;
}
```

