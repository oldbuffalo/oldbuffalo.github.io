---
title: Variadic Templates
date: 2019-04-25 14:22:25
tags:
- C++
- C++11
---

记录一下可变模板参数的使用方法。(C++ Primer p619)

用一个省略号来指出一个模板参数或函数参数表示一个包。在一个模板参数列表中，class...或typename...指出接下来的参数表示零个或者多个类型的列表。

先来看一个例子

```
void print(){}
template <typename T,typename...Types>
void print(const T& firstArg,const Types&...args){
    cout<<firstArg<<endl;
    print(args...);   //recursive
}

int main(){
   print(7.5, "hello", bitset<16>(100), 42); 
}

//最终输出
7.5
hello
0000000001100100
42
```

...叫做一个所谓的pack(包)

Types是模板参数包，args是函数参数包，都表示零个或多个参数

注意点：

- 三次...的位置的区别，语法规范
- 第一行单写的一个print是递归终止的条件，很关键。对于主函数中调用的print，传入的参数是4个，对于可变模板方法而言是1个和其他，就把第一个输出，把其他三个传入print，再把第一个输出，把其他两个传入print，再把第一个输出，其他一个传入print，再把第一个输出，其他零个传入print，这时候就调用第一行的print。

进一步思考：

```
template <typename...Types>
void print(const Types&...args){
   //...
}
```

这个可变参数模板函数能和上面的共存吗？

按照正常的理解，假如传入print的参数个数是5个，既可以被看成1个和4个，也可以被看成5个，这会造成歧义。但实际上编译时可以通过的。

经过测试，调用的是1个和其他个的版本，至于原因，以后补上。

通过sizeof...运算符可以知道包中元素的个数。

```
template <typename...Types>
void print(const Types&...args){
    cout<<sizeof...(Types)<<endl;
    cout<<sizeof...(args)<<endl;
}
```

