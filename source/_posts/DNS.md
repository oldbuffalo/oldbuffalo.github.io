---
title: DNS
date: 2019-03-07 09:23:40
tags:
- 网络
- Linux高性能服务器编程
---

## DNS工作原理

DNS是一套分布式的域名服务系统。每个DNS服务器上都存放着大量的机器名和IP地址的映射，并且是动态更新的。众多网络客户端程序都使用DNS协议来向DNS服务器查询目标主机的IP地址。



<!-- more -->

## DNS查询和应答报文详解

![DNS查询和应答报文](/pic/DNS报文.png)

16位标识：标记一对DNS查询和应答，以此区分一个DNS应答是哪个DNS查询的回应

16位标记：协商具体的通信方式和反馈通信状态。

标志字段细节如下：

![](/pic/DNS报文标志字段.png)

- QR：查询/应答标志。0表示这是一个查询报文，1表示这个一个应答报文
- opcode：定义查询和应答的类型。0表示标准查询，1表示反向查询(由IP获得域名)，2表示请求服务器状态
- AA：授权应答标志，仅由应答报文使用。1表示域名服务器是授权服务器
- TC：截断标志，仅当DNS报文使用UDP服务时使用，因为UDP数据报有长度限制，所以过长的DNS报文将被截断。1表示DNS报文超过512字节，并被截断。
- RD：递归查询标志。1表示执行递归查询，即如果目标DNS服务器无法解析某个主机名，则它将向其他DNS服务器继续查询，如此递归，知道获得结果并把该结果返回给客户端。0表示执行迭代查询，即如果目标DNS服务器无法解析某个主机名，则它将自己知道的其他DNS服务器的IP地址返回给客户端，以供客户端参考
- RA：允许递归标志，仅供应答报文使用,1表示支持递归查询
- zero：这3位未用，必须都置0
- rcode：4位返回码，表示应答的状态。常用值0（无错误），3（域名不存在）

接下来的4个字段分别指出DNS报文的最后4个字段的资源记录数目。对查询报文而言，一般包含一个查询问题，而应答资源记录数、授权资源记录数和额外资源记录数则为0。应答报文的应答资源记录数则至少为1，而授权资源记录数和额外资源记录数可为0或非0。

查询问题的格式如下：

![](/pic/查询问题格式.png)

查询名：以一定的格式封装了要查询的主机域名。

查询类型：表示如何执行查询操作

- 类型A：值为1，表示获取目标主机的IP地址
- 类型CNAME：值为5，表示获得目标主机的别名
- 类型PTR：值为12，表示反向查询

查询类：通常是1，表示获取因特网地址（IP地址）

应答字段、授权字段和额外信息字段都使用资源记录格式。

资源记录格式如下：

![](/pic/资源记录格式.png)

域名：该记录中与资源对应的名字，其格式和查询问题中的查询名字段相同

类型和类字段与DNS查询问题的对应字段相同

生存时间：表示该查询记录结果可被本地客户端程序缓存多长时间，单位是秒

资源数据长度和资源数据字段的内容取决于类型字段。对类型A而言，资源数据是

32位的IPv4地址，资源数据长度时4(字节)。

## 访问DNS服务

Linux下使用/etc/resolv.conf文件来存放DNS服务器的IP地址

Linux下常用的访问DNS服务器的客户端程序是host，host使用DNS协议和DNS服务器通信

![](/pic/host命令.png)

-t选项告诉DNS协议使用哪种查询类型，这里用A，通过域名查询IP地址

由结果可见，www.baidu.com是www.a.shifen.com.的别名，并且该机器名对应两个IP地址。

## tcpdump抓包

![](/pic/DNS_tcpdump1.png)

这两个数据包开始的"IP"指出，它们后面的内容是IP数据包

tcpdump以“IP 地址.端口号”的形式来描述通信的某一端；以">"表示数据传输方向，">"前面是源端，后面是目的端。

由此可见第一个数据包是从我的虚拟机(IP为"192.168.152.129")向其首选DNS服务器(IP地址是192.168.152.2)发送的DNS查询报文(目标端口53是DNS服务器使用的端口)，第二个数据包是服务器反馈的DNS应答报文。

在第一个数据包中，数值61258是DNS查询报文的16位标识值，因此该值也出现在应答报文中。“+“表示开启递归查询标志，”A?“表示使用A类型的查询方式。"www.baidu.com"是DNS查询问题中的查询名。括号中的数值31是DNS查询报文的长度(以字节为单位)。

第二个数据包中的 3/0/0 表示该报文中包含3个应答资源记录、0个授权资源记录、0个额外信息记录。后面的三项就是表示3个应答资源记录，该报文长度时90字节。

书上没有展示-x之后的效果，自己试了一下

![](/pic/DNS_tcpdump2.png)

由于抓取的是IP数据包，因此还封装了IP头和UDP头，定位DNS数据包不太容易。

根据DNS查询报文的标识值10807，算出16进制0x2a37，在数据包中能找到2a37

观察2a37后两个字节0x0100代表DNS查询标志字段，对比DNS标志字段的详细信息可见第7位(从0开始)正是RD字段，1表示执行递归查询。接下来两个字节0x0001表示1个问题个数，然后六个字节都是0x00，表示0个应答资源记录、0个授权资源记录、0个额外资源数目。然后分析遇到了问题(很难受，先码上吧，以后解决)。