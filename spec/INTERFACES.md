# 模块接口规范

## 模块 1: SourceLoader

```typescript
// src/loader/index.ts

/**
 * 加载并解析 .l 文件
 * @param filename 输入文件路径
 * @returns 解析后的 LexSpec
 * @throws SyntaxError 当文件格式不正确时
 */
export function load(filename: string): LexSpec;

/**
 * 从字符串加载（用于测试）
 * @param content 文件内容
 * @param filename 用于错误报告的文件名（可选）
 */
export function loadFromString(content: string, filename?: string): LexSpec;

/**
 * 展开宏定义
 * @param pattern 包含宏的正则表达式，如 "{DIGIT}+"
 * @param definitions 宏定义列表
 * @returns 展开后的正则，如 "[0-9]+"
 */
export function expandMacros(pattern: string, definitions: Definition[]): string;
```

**错误处理**: 抛出自定义错误类型 `LexerSpecError`，包含行号和列号信息。

---

## 模块 2: ReParser

```typescript
// src/reparser/index.ts

/**
 * 将正则表达式解析为 NFA
 * @param pattern 正则表达式字符串
 * @returns NFA 对象
 * @throws RegexParseError 当正则语法错误时
 */
export function parse(pattern: string): NFA;

/**
 * 正则 Token（内部使用，也可导出用于测试）
 */
export type RegexToken =
    | { type: 'CHAR'; value: number }
    | { type: 'ESCAPED'; value: number }
    | { type: 'CLASS'; value: CharClass }
    | { type: 'DOT' }
    | { type: 'STAR' }
    | { type: 'PLUS' }
    | { type: 'QUESTION' }
    | { type: 'PIPE' }
    | { type: 'LPAREN' }
    | { type: 'RPAREN' }
    | { type: 'LBRACE' }
    | { type: 'RBRACE' }
    | { type: 'COMMA' }
    | { type: 'EOF' };

/**
 * 词法分析器（内部使用）
 */
export class RegexLexer {
    constructor(input: string);
    nextToken(): RegexToken;
    peek(): RegexToken;
}

/**
 * 语法分析器（内部使用）
 */
export class RegexParser {
    constructor(lexer: RegexLexer);
    parse(): RegexAST;
}

/**
 * NFA 构造器（内部使用）
 */
export class NFABuilder {
    /**
     * 从 AST 构造 NFA
     */
    buildFromAST(ast: RegexAST): NFA;

    /**
     * 直接构造字符 NFA
     */
    buildChar(char: number): NFA;

    /**
     * 直接构造字符类 NFA
     */
    buildClass(cls: CharClass): NFA;

    /**
     * 连接两个 NFA
     */
    buildConcat(a: NFA, b: NFA): NFA;

    /**
     * 构造并 NFA (a|b)
     */
    buildUnion(a: NFA, b: NFA): NFA;

    /**
     * 构造闭包 NFA (a*)
     */
    buildStar(a: NFA): NFA;

    /**
     * 构造正闭包 NFA (a+)
     */
    buildPlus(a: NFA): NFA;

    /**
     * 构造可选 NFA (a?)
     */
    buildOptional(a: NFA): NFA;

    /**
     * 构造重复 NFA (a{m,n})
     */
    buildRange(a: NFA, min: number, max: number | null): NFA;
}
```

---

## 模块 3: Merger

```typescript
// src/merger/index.ts

/**
 * 将多个 NFA 合并为一个
 *
 * 算法:
 * 1. 创建新的起始状态
 * 2. 从新的起始状态添加 ε-转移到每个 NFA 的起始
 * 3. 保留所有 NFA 的接受状态
 * 4. 标记每个接受状态对应的规则编号（数值越小优先级越高）
 *
 * @param nfas NFA 列表，与 rules 一一对应
 * @param rules 规则列表，用于标记优先级
 * @returns 合并后的 NFA
 */
export function merge(nfas: NFA[], rules: Rule[]): NFA;

/**
 * 合并后的 NFA 信息
 */
export interface MergedNFAInfo {
    // 原始 NFA 数量
    originalCount: number;

    // 合并后的总状态数
    totalStates: number;

    // 接受状态数
    acceptStates: number;
}

/**
 * 获取合并信息（调试用）
 */
export function getMergeInfo(nfa: NFA): MergedNFAInfo;
```

---

## 模块 4: Simplifier

```typescript
// src/simplifier/index.ts

/**
 * 简化 NFA：NFA → DFA → 最小化 DFA
 * @param nfa 输入 NFA（通常是合并后的）
 * @returns 最小化后的 DFA
 */
export function simplify(nfa: NFA): DFA;

/**
 * NFA → DFA（子集构造法）
 * 可单独导出用于测试
 */
export function subsetConstruction(nfa: NFA): DFA;

/**
 * DFA 最小化（Hopcroft 算法）
 * 可单独导出用于测试
 */
export function minimize(dfa: DFA): DFA;

/**
 * ε-闭包计算
 * 可单独导出用于测试
 */
export function epsilonClosure(states: Set<State>): Set<State>;

/**
 * Move 操作（子集构造）
 * 可单独导出用于测试
 */
export function move(states: Set<State>, char: number): Set<State>;

/**
 * 简化过程信息
 */
export interface SimplifyInfo {
    // 原始 NFA 状态数
    nfaStates: number;

    // 构造后的 DFA 状态数（未最小化）
    dfaStatesBefore: number;

    // 最小化后的 DFA 状态数
    dfaStatesAfter: number;

    // 压缩比
    compressionRatio: number;
}

/**
 * 获取简化信息（调试用）
 */
export function getSimplifyInfo(dfa: DFA): SimplifyInfo;
```

---

## 模块 5: Generator

```typescript
// src/generator/index.ts

/**
 * 生成 C 代码
 * @param dfa 最小化后的 DFA
 * @param spec 原始 LexSpec（用于获取动作代码等）
 * @param outputFile 输出文件路径
 */
export function generate(dfa: DFA, spec: LexSpec, outputFile: string): Promise<void>;

/**
 * 生成 C 代码到字符串
 * 用于测试，不写入文件
 */
export function generateToString(dfa: DFA, spec: LexSpec): string;

/**
 * 生成选项
 */
export interface GenerateOptions {
    // 是否启用表压缩（默认 true）
    compressTables: boolean;

    // 是否生成调试输出（默认 false）
    debug: boolean;

    // 生成的词法分析器函数名（默认 "yylex"）
    functionName: string;

    // 生成的文件名（默认 "lex.yy.c"）
    filename: string;
}

/**
 * 带选项的生成
 * @param dfa 最小化后的 DFA
 * @param spec 原始 LexSpec
 * @param outputFile 输出文件路径
 * @param options 生成选项
 */
export function generateWithOptions(
    dfa: DFA,
    spec: LexSpec,
    outputFile: string,
    options: Partial<GenerateOptions>
): Promise<void>;

/**
 * 生成的代码结构（用于高级定制）
 */
export interface GeneratedCode {
    // 头部分（包含、宏定义）
    header: string;

    // 状态转移表
    transitionTable: string;

    // 接受状态表
    acceptTable: string;

    // 词法分析函数
    lexerFunction: string;

    // 动作代码（switch-case）
    actions: string;

    // 用户代码
    trailer: string;
}

/**
 * 分别生成各部分（用于测试）
 */
export function generateParts(dfa: DFA, spec: LexSpec): GeneratedCode;
```

---

## 主入口

```typescript
// src/index.ts

/**
 * 编译 .l 文件生成词法分析器
 * @param inputFile 输入的 .l 文件路径
 * @param outputFile 输出的 .c 文件路径（默认 lex.yy.c）
 */
export function compile(inputFile: string, outputFile?: string): Promise<void>;

/**
 * 编译选项
 */
export interface CompileOptions {
    // 输出文件
    output?: string;

    // 是否启用优化
    optimize?: boolean;

    // 是否显示调试信息
    verbose?: boolean;
}

/**
 * 带选项的编译
 * @param inputFile 输入的 .l 文件路径
 * @param options 编译选项
 */
export function compileWithOptions(
    inputFile: string,
    options: CompileOptions
): Promise<void>;

// 导出所有模块
export * from './loader';
export * from './reparser';
export * from './merger';
export * from './simplifier';
export * from './generator';
```

---

## 错误类型

```typescript
// src/errors.ts

export class SeuLexError extends Error {
    constructor(message: string, public line?: number, public column?: number);
}

export class LexerSpecError extends SeuLexError {
    // .l 文件格式错误
}

export class RegexParseError extends SeuLexError {
    // 正则表达式语法错误
    constructor(message: string, public position: number);
}

export class NFAConstructionError extends SeuLexError {
    // NFA 构造错误（内部错误，通常不应发生）
}

export class GenerationError extends SeuLexError {
    // 代码生成错误
}
```
