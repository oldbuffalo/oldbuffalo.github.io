---
title: STL容器性能测试
date: 2019-04-28 19:15:35
tags:
- C++
- STL
---

之前说到STL有六大部件，这里着重介绍一下容器部分。

容器就是用来装数据的，难的地方就是需要根据数据的特征以及考虑要对数据进行的操作选择合适的容器，同时还要考虑容器的内存分布。

#### STL容器总览图

![](/pic/STL容器.png)

其中主要分为顺序式和关联式。关联式的查找速度更快

array、vector、deque底层数据结构都是数组

list、forward_list底层数据结构是链表

set、multiset、map、multimap底层数据结构是红黑树

其中set、map键值不允许重复，multiset、multimap允许重复

unordered_set、unordered_multiset、unordered_map、unordered_multimap、

hash_set、hash_multiset、hash_multimap、hash_map底层数据结构是hash表

还有图中没写出来的stack、queue、priority_queue都是线性结构

[STL容器详细文档](https://github.com/huihut/interview/blob/master/STL/STL.md)

小技巧：在编写测试程序的时候，让每个单元在独立的命名空间里面

<!--more-->

## 顺序式容器

#### array

这是C++11新添加的容器，封装了最常用的数组

[array测试代码](https://github.com/oldbuffalo/DayDayUp/blob/master/STL/array_test.h)

#### vector

[vector测试代码](https://github.com/oldbuffalo/DayDayUp/blob/master/STL/vector_test.h)

vector只有push_back操作，而没有push_front操作，是因为push_front的话之后的元素都要后移，很耗费时间。在插入操作的时候不够的话自动扩展，二倍扩展，将原有数据拷贝到新的空间，然后释放旧空间。

通过测试，发现STL算法中的find算法相比较于 先排序(快排)再二分查找  前者查找的速度快很多。

#### list

[list测试代码](https://github.com/oldbuffalo/DayDayUp/blob/master/STL/list_test.h)

双向链表，头尾都可以添加和删除

#### forward_list

[forward_list测试代码](https://github.com/oldbuffalo/DayDayUp/blob/master/STL/forward_list_test.h)

单向链表，这也是C++11新添加的容器，只能头添加和头删除，因为如果没有指针标记链表尾部的话，从末尾添加元素每次都需要遍历到末尾，效率很低。

#### deque

[deque测试代码](https://github.com/oldbuffalo/DayDayUp/blob/master/STL/deque_test.h)

双端队列,内存不是真正意味上的连续，每一段之间是连续的,头尾都能添加和删除

![](/pic/deque结构.png)

#### stack

栈(先进后出) ，push和pop操作

[stack测试代码](https://github.com/oldbuffalo/DayDayUp/blob/master/STL/stack_test.h)

#### queue

队列(先进先出)，push和pop操作

[queue测试代码](https://github.com/oldbuffalo/DayDayUp/blob/master/STL/queue_test.h)

需要注意的是:

![](/pic/stack结构.png)

由上图可见，deque也能够完成stack的功能

![](/pic/queue结构.png)

由上图可见，deque也能够完成queue的功能

实际上，stack和queue的源代码内部拥有一个deque。也就是stack和queue本身没有去实现数据结构，而是用deque作为支撑。因此，stack和queue也能叫做容器的适配器。

## 关联式容器(适合查找)

### key值可以重复

#### multiset

[multiset测试代码](https://github.com/oldbuffalo/DayDayUp/blob/master/STL/multiset_test.h)

注意包含的是set头文件，插入元素用insert方法

使用全局的find()和容器自带的find()函数进行查找效率的比较，发现容器自带的find速度更大。

#### multimap

[multimap测试代码](https://github.com/oldbuffalo/DayDayUp/blob/master/STL/multimap_test.h)

注意包含的是map头文件，插入元素用insert方法,用pair<>构建插入的键值对

#### unordered_multiset

C++11新加入的容器

[unordered_multiset测试代码](https://github.com/oldbuffalo/DayDayUp/blob/master/STL/ordered_multiset_test.h)

注意包含的是unordered_set头文件，插入元素用insert方法

使用全局的find()和容器自带的find()函数进行查找效率的比较，发现容器自带的find速度更大。

#### unordered_multimap

C++11新加入的容器

[unordered_multimap测试代码](https://github.com/oldbuffalo/DayDayUp/blob/master/STL/ordered_multimap_test.h)

注意包含的是unordered_map头文件，插入元素用insert方法,用pair<>构建插入的键值对

### key值不能重复

#### set

和上面的multiset和unordered_multiset的区别在于，key值唯一不能有重复

[set测试代码](https://github.com/oldbuffalo/DayDayUp/blob/master/STL/set_test.h)

#### map

和上面的multimap和unordered_multimap的区别在于，key值唯一不能有重复

插入元素可以用[]和insert,而multimap只能用insert

[map测试代码](https://github.com/oldbuffalo/DayDayUp/blob/master/STL/map_test.h)

#### unordered_set

C++11新加入的容器

[unordered_set测试代码](https://github.com/oldbuffalo/DayDayUp/blob/master/STL/unordered_set.h)

和上面的multiset和unordered_multiset的区别在于，key值唯一不能有重复

#### unordered_map

C++11新加入的容器

和上面的multimap和unordered_multimap的区别在于，key值唯一不能有重复

插入元素可以用[]和insert

[unordered_map测试代码](https://github.com/oldbuffalo/DayDayUp/blob/master/STL/unordered_map.h)

注意点：各种类型的map都不支持全局的find函数

GNU C的标准库带的hash_set、hash_map、hash_multiset、hash_multimap就是现在C++11中以unordered开头的容器，因此就不再进行测试了。

GNU C 也有一个非标准库的单向链表类slist