---
title: STL六大部件
date: 2019-04-25 20:37:20
tags:
- C++
- STL
---

C++中很重要的一个库就是STL(Standard Template Library),叫做标准模板库，是C++标准库的一部分。

六大组件

- 容器(Containers)
- 分配器(Allocator)
- 算法(Algorithms)
- 迭代器(Iterators)
- 适配器(Adapters)
- 仿函数(Functors)

<!--more-->

![](/pic/STL组件之间的关系.png)

容器的作用是存储数据，数据需要占用内存，但是不需要我们管理内存，所以背后需要有分配器去支持容器。

有一些操作是在容器本身做的，但是更多的操作被独立出来写成一个一个模板函数，封装在算法模块中。

这里有一个观念需要注意：在面向对象编程中，我们希望数据和对数据的操作封装在一个类中，而STL将数据存储在容器中，对数据的操作写在算法中，做到了数据结构和算法的分离，这是模板编程的思想(generic programming)。

迭代器是容器和算法之间的桥梁，迭代器就像是一种泛化的指针。

仿函数作用像是一种函数

适配器，adapter在英文中就是变压器，变压器做的就是电压的转换工作。因此适配器做的也是转换工作。

实例程序：

```
#include<vector>
#include<algorithm>
#include<functional>
#include<iostream>
using namespace std;

int main()
{
	int ia[6] = { 27,210,12,47,109,40 };
	vector<int, allocator<int>> iv(ia, ia + 6); //allocator可以不写，底层默认有分配器

	cout << count_if(iv.begin(), iv.end(),
		not1(bind2nd(less<int>(), 40)));
	//count_if 满足条件的元素的数量
	//less<int>() 仿函数 比较两个元素  但是现在是和40比较 因此用bind2nd固定第二个参数
	//bind2nd是一个仿函数适配器，bind2nd(less<int>(), 40)表示小于40
	//not1也是仿函数适配器，表示对条件取反，也就是编程大于等于40
	//最终输出的是数组中大于等于40的元素个数 也就是4
	return 0;
}
```

遍历容器的方法：

```
Container<T> c;  //这里Container只是泛指，没有具体指哪个容器
...
Container<T>::iterator ite = c.begin();
for(;ite != c.end();ite++)
	...
	
list<string> l;
...
list<string>::iterator ite;
ite = ::find(l.begin(),l.end(),target);

//C++11之后的简便写法   range-based for的应用以及auto关键字
for(int i : {2,3,4,7,9})
	cout<<i<<endl;

vector<double> vec;
...
for(auto elem : vec)
	cout<<elem<<endl;

for(auto &elem : vec)
	elem *= 3;	

list<string> l;
...
auto ite = ::find(l.begin(),l.end(),target);


```

