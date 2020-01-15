---
title: Linux网络编程流程
date: 2019-03-12 19:40:26
tags:
- 网络
- Linux
- Linux高性能服务器编程
---

## 服务器端

1.创建socket

int socket(int domain,int type,int protocol)；

自Linux内核2.6.17起，type参数可以接收SOCK_NONBLOCK和SOCK_CLOEXEC

分别表示将新创建的socket设置为非阻塞(fcntl也能完成)，以及用fork调用创建子进程时在子进程中关闭该socket

<!--more-->

2.命名socket

int bind(int sockfd,const struct sockaddr* my_addr,socklen_t addrlen);

将一个socket和socket地址绑定称为给socket命名

socket地址分为通用socket地址和专用socket地址，具体参见《Linux高性能服务器编程》p71-73

成功返回0，错误返回-1并设置errno。常见的errno是EACCES和AADDRINUSE

- EACCES：被绑定的地址是受保护的地址，进超级用户能访问，比如普通用户将socket绑定到知名服务端口
- EADDRINUSE：被绑定的地址正在使用中。比如讲socket绑定到一个处于TIME_WAIT状态的地址

在构建socket地址的时候涉及一些转换函数。

主机字节序和网络字节序之间的转换（大小端）

       uint32_t htonl(uint32_t hostlong);
       uint16_t htons(uint16_t hostshort);
       uint32_t ntohl(uint32_t netlong);
       uint16_t ntohs(uint16_t netshort);
IP地址转换函数

       in_addr_t inet_addr(const char *cp);
       int inet_aton(const char *cp, struct in_addr *inp);
       char *inet_ntoa(struct in_addr in);  不可重入函数，内部用静态变量保存结果
       /*上面三个针对IPv4，下面两个IPv4和IPv6都适用*/
       in_addr_t inet_addr(const char *cp);
       const char *inet_ntop(int af, const void *src,char *dst, socklen_t size);
3.监听socket

int listen(int sockfd,int backlog);

创建监听队列来存放待处理的客户连接。

Linux内核2.2之后，backlog参数表示处于完全连接状态(ESTABLISHED)的socket的上限。

处于半连接状态的socket上限由/proc/sys/net/ipv4/tcp_max_syn_backlog内核参数定义

下面通过程序测试，[代码链接](https://github.com/oldbuffalo/High-performance-Linux-Server-Programming/blob/master/5_chapter/5_3.cpp)

启动服务器，设置backlog参数值为5

![](/pic/listen测试.png)

在本机开启终端用telnet连接服务器

![](/pic/listen测试2.png)

在本机开启了8个终端，连接到服务器，然后用netstat观察

![](/pic/listen测试3.png)

观察到8个连接中有6个处于ESTABLISHED状态，两个处于SYN_RECV状态。

可见处于ESTABLISHED状态的连接最多是backlog+1个，改变backlog值重新测试，也能得到相同结论。

在不同系统上，结果可能会不同。一般完整连接数都略大于backlog的值。(有待考证)

4.接受连接

int accept(int sockfd,struct sockaddr* addr,socklen_t *addrlen_t);

对于接受连接的accept函数，它从监听队列中取出一个连接，与其建立连接，而不管其处于ESTABLISHED或CLOSE_WAIT状态，更不关心任何网络变化。

考虑一种特殊情况：如果监听队列中处于ESTABLISHED状态的连接对应的客户端出现网络异常等原因导致提前退出，根据上述的结论，accept也能调用成功。

5.数据读写

TCP:

ssize_t recv(int sockfd,void* buf,size_t len,int flags);

ssize_t send(int sockfd,const void* buf,size_t len,int flags);

因为Unix下一切皆文件，因此对文件的读写操作read和write同样适用于socket

flags参数为数据收发提供了额外的控制，一般设置为0。它可以设置为下图选项中的一个或几个。

![](/pic/数据读写flags.png)

send和recv接发普通数据和带外数据,[客户端](https://github.com/oldbuffalo/High-performance-Linux-Server-Programming/blob/master/5_chapter/5_6.cpp)、[服务器](https://github.com/oldbuffalo/High-performance-Linux-Server-Programming/blob/master/5_chapter/5_7.cpp)

总共发送了三次数据

普通数据 "123"

带外数据 "abc"

普通数据 “123"

服务器端的输出为：

![](/pic/TCP收发数据结果.png)

客户端发给服务器的3字节带外数据“abc”中，仅有最后一个字符‘c’被服务器当成真正的带外数据接收。

并且服务器对正常数据的接收被带外数据截断。"123ab"和“123”不能被一个recv全部读出来。

tcpdump关于带外数据的输出：

![](/pic/抓包带外数据.png)

标志U代表TCP头部设置了紧急标志，"urg 3"是紧急偏移值，指出带外数据在字节流中的位置的下一个字节位置是7(4+3,4是该TCP报文的序号值的相对初始序号值的偏移)。因此带外数据是字节流中的第6个字符，即'c'。

注意：flags参数支队send和recv的当前调用生效。通过setsockopt可以永久性修改socket的某些属性。

关于带外数据：

很多时候，我们无法预期带外数据何时到来，但是好在Linux内核检测到TCP紧急标志时，会通知应用程序有带外数据需要接收。内核通知应用程序带外数据到达的两种常见方式：

- I/O复用产生的异常事件
- SIGURG信号

除了需要知道有带外数据到达，还需要知道带外数据在字节流中的位置。

int sockatmark(int sockfd);   

该函数的作用是判断sockfd是否处于带外标记，即下一个被读取到的数据是否是带外数据，如果是，返回1，此时就可以利用带MSG_OOB标记的recv调用来接收带外数据。 如果不是，返回0。

UDP：

ssize_t recvfrom(int sockfd,void* buf,size_t len,int flags,struct sockaddr* src_addr,socklen_t* addrlen);

ssize_t sendto(int sockfd,const void* buf,size_t len,int flags,const struct sockaddr* dest_addr,socklen_t addflen);

因为UDP通信没有连接的概念，所以我们每次读取数据都需要获取发送端的socket地址。

特别的：recvfrom/sendto也可以用于面向连接（STREAM）的socket的数据读写， 只需要把最后两个参数设置为NULL。

通用数据读写函数：
ssize_t recvmsg(int sockfd,struct msghdr* msg,int flags);

ssize_t sendmsg(int sockfd,struct msghdr* msg,int flags);

```
struct msghdr{
	void* msg_name;              //socket地址
    socklen_t msg_namelen;       //socket地址的长度
    struct iovec* msg_iov;       //分散的内存块
    int msg_iovlen;              //分散内存块的数量
    void* msg_control;           //指向辅助数据的起始位置
    socklen_t msg_controllen;    //辅助数据的大小
    int msg_flags;               //复制函数中的flags参数，并在调用过程中更新
};

struct iovec{
  	void* iov_base;              //内存起始地址
    size_t iov_len;              //这块内存的长度
};
```

对于recvmsg而言，数据将被读取并存放在msg_iovlen块分散的内存中，这些内存的位置和长度则由msg_iov指向的结构体指定，这称为分散读。

对于sendmsg而言，msg_iovlen块分散内存中的数据将一并发送，这称为集中写。

6.关闭连接

int close(int fd);

注意：close系统调用并非总是立即关闭一个连接，而是将fd的引用计数减1.只有当fd的引用计数为0时才真正关闭连接。多进程程序中，一次fork系统调用默认将使父进程中打开的socket的引用计数加1，因此必须在父进程和子进程中都对该socket执行close调用才能将连接关闭。(创建socket的时候有SOCK_CLOEXEC选项可以解决这个问题)

int shutdown(int sockfd,int howto);

无论如何都要立即终止连接，而不是将socket的引用计数减1。

![](/pic/shutdown参数.png)





## 客户端

1.创建socket

注意：客户端不需要命名socket，只需要用操作系统自动分配的socket地址，服务器需要bind，是因为客户端需要找到它，因此每次都需要一个固定的ip+port。

2.发起连接

int connect(int sockfd,const struct sockaddr* serv_addr,socklen_t addrlen);

发起连接需要知道服务器的socket地址

成功返回通信的socket，失败返回-1并设置errno,常见的errno

- ECONNREFUSED:目标端口不存在，连接被拒绝
- ETIMEOUT:连接超时
- EINPROGRESS:发生在对非阻塞的socket调用connect，而连接又没有立即建立。这时候我们可以调用select、poll等函数来监听这个连接失败的socket上的可写事件。当select、poll等函数返回后，再利用getsockopt来读取错误码并清除该socket上的错误。如果错误码为0，表示连接成功建立，否则连接失败

[非阻塞connect](https://github.com/oldbuffalo/High-performance-Linux-Server-Programming/blob/master/9_chapter/unblock_connect.cpp)

3.数据读写

4.关闭连接



## 一些额外的信息

**地址信息函数**

int getsockname(int sockfd,struct  sockaddr* address,socklen_t* address_len);

int getpeername(int sockfd,struct sockaddr* address,socklen_t* address_len);

分别的作用是获取sockfd对应的本端socket地址和远端socket地址。

**网络信息函数**

socket地址两个要素：ip+port，都是数值，不方便记忆。

可以用主机名来访问一台机器，用服务名来代替端口号。

struct hostent* gethostbyname(const char* name);

根据主机名称获取主机的完整信息，通常先在/etc/hosts配置文件中查找主机，如果没找到，再访问DNS服务器

struct hostent* gethostbyaddr(const void* addr,size_t len,int type);

根据IP地址获取主机的完成信息

```
struct hostent{
	char* h_name;         //主机名
    char** h_aliases;     //主机别名列表
    int h_addrtype;       //地址类型(地址族)
    int h_length;         //地址长度
    char** h_addr_list;   //按网络字节序列出的主机IP地址列表
};
```

struct servent* getservbyname(const char* name,const char* proto);

根据名称获取某个服务的完整信息

struct servent* getservbyport(int port,const char* proto);

根据端口号获取某个服务的完整信息

实际上两个函数都是通过读取/etc/services文件来获取服务信息的

```
struct servent{
	char* s_name;            //服务名称
    char** s_aliases;        //服务的别名列表
    int s_port;              //端口号
    char* s_proto;           //服务类型  tcp/udp
};
```



int getaddrinfo(const char* hostname,const char* service,const struct addrinfo* hints,struct addrinfo** result);

该函数既能通过主机名获得IP地址，也能通过服务器获得端口号。

hostname既可以是主机名，也可以是IP地址

service既可以是服务器，也可以是字符串表示的十进制端口号

hints是用来对getaddrinfo输出进行更精确的控制，也可以设置为NULL

result参数返回的是一个链表，该链表用来存储getaddrinfo反馈的结果

void freeaddrinfo(struct addrinfo* res)；

释放getaddrinfo为res申请的堆空间

```
struct addrinfo{
	int ai_flags;                   //见下图
    int ai_family;                  //地址族
    int ai_socktype;                //服务类型  SOCK_STREAM/SOCK_DGRAM
    int ai_protocol;                //具体网络协议  通常为0
    socklen_t ai_addrlen;           //socket地址长度
    char* ai_addrlen;               //主机的别名
    struct sockaddr* ai_addr;       //指向socket地址
    struct addrinfo* ai_next;       //指向下一个addrinfo对象
};
```

![](/pic/ai_flags.png)



int getnameinfo(const struct sockaddr* sockaddr,socklen_t addrlen,char* host,socklen_t hostlen,char* serv,socklen_t servlen,int flags);

该函数能通过socket地址同时获得以字符串表示的主机名和服务名。

flags参数

![](/pic/gestnameinfo_flags.png)

getaddrinfo和getnameinfo返回的错误码

![](/pic/地址信息错误码.png)