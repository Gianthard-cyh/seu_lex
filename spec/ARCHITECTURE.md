# SeuLex 架构设计文档

## 项目概述

SeuLex 是一个类 Flex 的词法分析器生成器，使用 TypeScript 实现。

## 字符编码

使用 **8-bit 字节流**（0-255），对应 `Uint8Array` 或 `Buffer`。
- 每个字符是一个 0-255 的整数
- 支持 ASCII (0-127) 和扩展 ASCII (128-255)
- 不直接处理 UTF-8 多字节编码（如需 Unicode 支持，未来可扩展）

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                         SeuLex                              │
└─────────────────────────────────────────────────────────────┘
│
├── 1. SourceLoader ──────────────────────────────────────────┤
│   输入: .l 文件 (类 Flex 格式)                               │
│   输出: LexSpec 数据结构                                     │
│   职责: 解析三段式结构，提取正则-动作规则列表                   │
│
├── 2. ReParser ─────────────────────────────────────────────┤
│   输入: 正则表达式字符串                                     │
│   输出: NFA 图                                              │
│   职责: 正则解析 → AST → NFA (Thompson 构造)                  │
│   注: 每个规则独立生成一个 NFA                                │
│
├── 3. Merger ───────────────────────────────────────────────┤
│   输入: NFA 列表 (每个规则一个 NFA)                           │
│   输出: 合并后的单一 NFA                                     │
│   职责: 通过新起始状态 ε-转移连接所有 NFA                      │
│
├── 4. Simplifier ───────────────────────────────────────────┤
│   输入: NFA                                                 │
│   输出: 最小化 DFA                                          │
│   职责: 子集构造(NFA→DFA) → DFA最小化 → 状态优化              │
│
├── 5. Generator ────────────────────────────────────────────┤
│   输入: DFA + 动作代码                                       │
│   输出: C 代码文件 (lex.yy.c)                               │
│   职责: 状态转移表生成 + 动作代码嵌入                          │
└─────────────────────────────────────────────────────────────┘
```

### 模块详细职责

| 模块 | 输入 | 输出 | 核心职责 |
|------|------|------|----------|
| **SourceLoader** | `.l` 文件路径 | `LexSpec` 对象 | 解析三段式结构，展开宏定义 |
| **ReParser** | 正则表达式字符串 | `NFA` 对象 | 正则解析 → AST → NFA |
| **Merger** | NFA 列表 | 单一 NFA | 合并多个 NFA 为一个（新起始状态）|
| **Simplifier** | NFA | 最小化 DFA | 子集构造 + DFA 最小化 |
| **Generator** | DFA + LexSpec | `.c` 文件 | 生成可编译的词法分析器 |

## 数据流

```
.l 文件
   │
   ▼
┌────────────┐
│SourceLoader│──▶ LexSpec { rules: [{pattern, action}, ...] }
└────────────┘
   │
   │ rules[0].pattern ──▶┌─────────┐
   │ rules[1].pattern ──▶│ReParser │──▶ NFA[]
   │ rules[2].pattern ──▶│         │
   │                     └────┬────┘
   │                          │
   │                     ┌────┴────┐
   │                     │ Merger  │──▶ 合并后的 NFA
   │                     └────┬────┘
   │                          │
   │                     ┌────┴────┐
   │                     │Simplifier│──▶ 最小化 DFA
   │                     └────┬────┘
   │                          │
   │                     ┌────┴────┐
   └────────────────────▶│Generator │──▶ lex.yy.c
                         └─────────┘
```

## 输入文件格式 (.l)

类 Flex 的三段式格式：

```
定义段
%%
规则段
%%
用户代码段
```

### 定义段

**头代码块**（会被原样复制到生成的 C 文件头部）：
```
%{
#include <stdio.h>
int my_variable = 0;
%}
```

**宏定义**：
```
DIGIT       [0-9]
LETTER      [a-zA-Z]
IDENTIFIER  {LETTER}({LETTER}|{DIGIT})*
```

### 规则段

每行一个规则，格式为 `模式 动作`：

```
{DIGIT}+        { return NUMBER; }
[ \t\n]+        { /* 忽略空白 */ }
"if"            { return IF; }
.               { return ERROR; }
```

**优先级规则**：
- 按定义顺序，数值越小优先级越高（规则0优先级最高）
- 对于同一状态被多个规则匹配，选择优先级最高的
- 通常将关键字放在标识符之前定义

### 用户代码段

%% 之后的内容会被原样复制到生成的 C 文件末尾：

```
%%
int main() {
    yylex();
    return 0;
}
```

### 完整示例

```
%{
#include <stdio.h>
%}

DIGIT       [0-9]
NUMBER      {DIGIT}+(\.{DIGIT}+)?

%%

{NUMBER}        { printf("NUMBER: %s\\n", yytext); }
[ \t\n]+        { /* 忽略空白 */ }
.               { printf("UNKNOWN: %c\\n", *yytext); }

%%

int main() {
    yyin = stdin;
    while (yylex() != 0);
    return 0;
}
```

## 核心算法概览

### 1. Thompson 构造法（ReParser）
将正则表达式 AST 转换为 NFA。

**时间复杂度**: O(|r|)，其中 |r| 是正则表达式长度
**空间复杂度**: O(|r|)

### 2. 子集构造法（Simplifier - NFA→DFA）
将 NFA 转换为等价的 DFA。

**时间复杂度**: O(2^n)，最坏情况（n 是 NFA 状态数）
**空间复杂度**: O(2^n)

**实际优化**: 惰性构造，只构造实际可达的状态

### 3. Hopcroft 算法（Simplifier - DFA 最小化）
将 DFA 状态最小化。

**时间复杂度**: O(n log n)，其中 n 是 DFA 状态数
**空间复杂度**: O(n)

### 4. 表压缩（Generator - 可选）
使用等价类压缩转移表。

**压缩比**: 通常可减少 80-90% 的表大小

## 测试示例

### 简单计算器

```
%{
#include <stdio.h>
%}

%%
[0-9]+          { printf("NUMBER: %s\\n", yytext); return 1; }
[+\-*/]         { printf("OP: %s\\n", yytext); return 2; }
[ \t\n]+        { /* 忽略 */ }
.               { printf("ERROR: %c\\n", *yytext); return -1; }

%%
int main() { while(yylex() > 0); return 0; }
```

### 标识符识别

```
%{
#include <stdio.h>
%}

KEYWORD     (if|else|while|return)
IDENT       [a-zA-Z_][a-zA-Z0-9_]*

%%

{KEYWORD}       { printf("KEYWORD: %s\\n", yytext); }
{IDENT}         { printf("IDENT: %s\\n", yytext); }
[ \t\n]+        { /* 忽略 */ }
.               { printf("OTHER: %c\\n", *yytext); }

%%
int main() { yylex(); return 0; }
```

## 优先级处理说明

### 规则优先级

在合并 NFA 时，每个接受状态会标记对应的规则编号：
- 规则编号 = 规则在 .l 文件中的定义顺序（从0开始）
- **数值越小，优先级越高**

### 冲突解决

当 DFA 的某个状态包含多个 NFA 接受状态时：
1. 收集所有接受状态的规则编号
2. 选择编号最小的（优先级最高的）
3. 该状态标记为接受状态，并记录对应的规则

### 示例

```
规则0: "if"      { return IF; }
规则1: [a-z]+    { return IDENT; }
```

输入 "if" 时：
- NFA 状态可能同时匹配规则0和规则1
- 选择规则0（编号更小，优先级更高）
- 返回 `IF` 而不是 `IDENT`

## 下一步

查看其他文档了解详细设计：
- [DATA_STRUCTURES.md](./DATA_STRUCTURES.md) - 数据结构定义
- [INTERFACES.md](./INTERFACES.md) - 模块接口规范
- [ALGORITHMS.md](./ALGORITHMS.md) - 核心算法伪代码
