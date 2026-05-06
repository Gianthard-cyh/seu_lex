# 数据结构设计

## 字符编码

本项目使用 **8-bit 字节流**（0-255），对应 `Uint8Array` 或 `Buffer`。
- 每个字符是一个 0-255 的整数
- 支持 ASCII (0-127) 和扩展 ASCII (128-255)
- 不直接处理 UTF-8 多字节编码（如需 Unicode 支持，未来可扩展）

---

## 1. SourceLoader 输出

### LexSpec

```typescript
interface LexSpec {
    // 定义段 %{ %} 中的内容（原样保留）
    header: string;

    // 宏定义，如 DIGIT [0-9]
    definitions: Definition[];

    // 规则列表
    rules: Rule[];

    // 用户代码段 %% 之后的内容（原样保留）
    trailer: string;
}

interface Definition {
    name: string;        // 如 "DIGIT"
    definition: string;  // 如 "[0-9]"
}

interface Rule {
    pattern: string;   // 正则表达式（宏已展开）
    action: string;    // 动作代码（{...} 中的内容）
    lineNo: number;    // 在源文件中的行号（用于错误报告）
    priority: number;  // 优先级，数值越小优先级越高（按定义顺序从0开始）
}
```

---

## 2. ReParser 输出

### NFA（非确定有限自动机）

```typescript
class NFA {
    // 起始状态
    start: State;

    // 接受状态
    accept: State;

    // 所有状态（用于遍历和内存管理）
    states: State[];

    // 状态计数器（用于分配唯一ID）
    private stateCounter: number;

    constructor(start?: State, accept?: State, states?: State[]) {
        this.start = start || this.newState();
        this.accept = accept || this.newState();
        this.states = states || [this.start, this.accept];
        this.stateCounter = this.states.length;
        if (!start) {
            // 默认创建的空 NFA，接受状态标记为接受
            this.accept.isAccept = true;
        }
    }

    // 创建新状态
    newState(): State {
        const s = new State(this.stateCounter++);
        return s;
    }

    // 深拷贝（用于正闭包等需要复制 NFA 的场景）
    clone(): NFA {
        const stateMap = new Map<State, State>();
        const newStates: State[] = [];

        // 复制所有状态
        for (const s of this.states) {
            const ns = new State(s.id);
            ns.isAccept = s.isAccept;
            ns.acceptRule = s.acceptRule;
            stateMap.set(s, ns);
            newStates.push(ns);
        }

        // 复制所有转移
        for (const s of this.states) {
            const ns = stateMap.get(s)!;
            for (const t of s.transitions) {
                ns.transitions.push({
                    type: t.type,
                    char: t.type === 'char' ? t.char : undefined,
                    class: t.type === 'class' ? t.class : undefined,
                    to: stateMap.get(t.to)!
                });
            }
        }

        return new NFA(
            stateMap.get(this.start)!,
            stateMap.get(this.accept)!,
            newStates
        );
    }
}

class State {
    // 唯一标识符
    id: number;

    // 出边转移列表
    transitions: Transition[];

    // 是否为接受状态
    isAccept: boolean;

    // 接受时对应的规则编号（用于合并后识别是哪个规则匹配，数值越小优先级越高）
    acceptRule: number;

    constructor(id: number) {
        this.id = id;
        this.transitions = [];
        this.isAccept = false;
        this.acceptRule = -1;
    }
}

type Transition =
    | { type: 'epsilon'; to: State }
    | { type: 'char'; char: number; to: State }
    | { type: 'class'; class: CharClass; to: State };
```

### 正则 AST（内部使用）

```typescript
type RegexAST =
    | { type: 'char'; char: number }
    | { type: 'class'; class: CharClass }
    | { type: 'any' }                    // .
    | { type: 'concat'; left: RegexAST; right: RegexAST }
    | { type: 'union'; left: RegexAST; right: RegexAST }
    | { type: 'star'; child: RegexAST }
    | { type: 'plus'; child: RegexAST }
    | { type: 'optional'; child: RegexAST }
    | { type: 'range'; child: RegexAST; min: number; max: number | null };
```

### 字符类

```typescript
interface CharClass {
    // 是否取反（[^...]）
    negated: boolean;

    // 字符范围列表，如 [a-zA-Z0-9] = [['a','z'], ['A','Z'], ['0','9']]
    ranges: [number, number][];

    // 单独列出的字符（用于 [aeiou] 这种）
    singles: number[];
}

// 判断字符是否属于字符类
function matchesClass(char: number, cls: CharClass): boolean {
    if (char < 0 || char > 255) return false;

    let inClass = false;

    // 检查单字符
    if (cls.singles.includes(char)) {
        inClass = true;
    }

    // 检查范围
    for (const [start, end] of cls.ranges) {
        if (char >= start && char <= end) {
            inClass = true;
            break;
        }
    }

    return cls.negated ? !inClass : inClass;
}

// 字符类取并集（用于优化）
function unionClass(a: CharClass, b: CharClass): CharClass;

// 字符类求补集
function negateClass(cls: CharClass): CharClass;
```

---

## 3. Merger 输出

Merger 输出也是 `NFA`，但具有以下特点：
- 新的起始状态（id = 0）
- 通过 ε-转移连接到每个子 NFA 的起始
- 每个接受状态标记了对应的规则编号（数值越小优先级越高）

---

## 4. Simplifier 输出

### DFA（确定有限自动机）

```typescript
class DFA {
    // 所有状态
    states: DFAState[];

    // 起始状态 ID
    startStateId: number;

    // 状态计数器
    private stateCounter: number;

    constructor() {
        this.states = [];
        this.startStateId = -1;
        this.stateCounter = 0;
    }

    // 添加新状态，返回状态 ID
    addState(nfaStates: Set<State>): number {
        const id = this.stateCounter++;
        const state = new DFAState(id, nfaStates);
        this.states.push(state);
        return id;
    }

    // 获取转移
    getTransition(stateId: number, char: number): number | null {
        if (stateId < 0 || stateId >= this.states.length) return null;
        const t = this.states[stateId].transitions[char];
        return t === -1 ? null : t;
    }

    // 设置转移
    setTransition(fromId: number, char: number, toId: number): void {
        if (fromId >= 0 && fromId < this.states.length) {
            this.states[fromId].transitions[char] = toId;
        }
    }
}

class DFAState {
    // 唯一标识符（在 DFA.states 数组中的索引）
    id: number;

    // 对应的 NFA 状态集合（仅构造时使用，构造完成后可丢弃）
    nfaStates: Set<State>;

    // 转移表: 字符 → 状态 ID
    // 使用数组大小为 256，-1 表示无转移
    transitions: Int16Array;

    // 是否为接受状态
    isAccept: boolean;

    // 接受的规则编号（多个规则可能映射到同一状态，取优先级最高的，即数值最小的）
    acceptRule: number;

    constructor(id: number, nfaStates: Set<State>) {
        this.id = id;
        this.nfaStates = nfaStates;
        this.transitions = new Int16Array(256).fill(-1);
        this.isAccept = false;
        this.acceptRule = -1;
    }
}
```

---

## 5. 辅助数据结构

使用原生 `Set` 和 `Map`，通过辅助函数提供额外功能：

```typescript
// 生成状态集合的唯一键（用于 Map 的键）
function setKey(states: Set<State>): string {
    const ids = Array.from(states)
        .map(s => s.id)
        .sort((a, b) => a - b);
    return ids.join(',');
}

// 队列（用于 BFS）
class Queue<T> {
    private items: T[] = [];
    private head = 0;

    enqueue(item: T): void {
        this.items.push(item);
    }

    dequeue(): T | undefined {
        if (this.head >= this.items.length) return undefined;
        return this.items[this.head++];
    }

    isEmpty(): boolean {
        return this.head >= this.items.length;
    }
}

// 栈（用于 DFS / ε-闭包）
class Stack<T> {
    private items: T[] = [];

    push(item: T): void {
        this.items.push(item);
    }

    pop(): T | undefined {
        return this.items.pop();
    }

    isEmpty(): boolean {
        return this.items.length === 0;
    }
}
```

---

## 6. 内存管理说明

### NFA 状态
- NFA 构造完成后，所有状态通过 `NFA.states` 数组持有
- 合并后的 NFA 包含所有子 NFA 的状态
- 使用 `clone()` 方法深拷贝 NFA（用于正闭包等场景）

### DFA 状态
- DFA 构造过程中，`nfaStates` 字段用于去重
- 构造完成后可释放 `nfaStates` 以节省内存（设为 `null`）

### 转移表
- DFA 转移表使用 `Int16Array(256)` 每个状态约 512 字节
- 对于大型 DFA，考虑使用 Map 进行稀疏存储（可选优化）

---

## 7. 数据结构关系图

```
LexSpec
├── header: string
├── definitions: Definition[]
├── rules: Rule[]          ──▶  ReParser.parse(pattern) ──▶ NFA
└── trailer: string                                          │
                                                             │
                                                             ▼
                    NFA ──▶  Merger.merge(nfas, rules) ──▶ 合并后的 NFA
                    │                                       │
                    │                                       ▼
                    │                            Simplifier.simplify()
                    │                                       │
                    │                                       ▼
                    │                                      DFA
                    │                                       │
                    │                                       ▼
                    │                          Generator.generate()
                    │                                       │
                    │                                       ▼
                    │                                   lex.yy.c
                    │
                    ▼
               NFA 结构
               ├── start: State
               ├── accept: State
               └── states: State[]

State
├── id: number
├── transitions: Transition[]
├── isAccept: boolean
└── acceptRule: number

Transition (union type)
├── { type: 'epsilon', to: State }
├── { type: 'char', char: number, to: State }
└── { type: 'class', class: CharClass, to: State }

CharClass
├── negated: boolean
├── ranges: [number, number][]
└── singles: number[]

DFA
├── states: DFAState[]
└── startStateId: number

DFAState
├── id: number
├── nfaStates: Set<State>    (仅构造时使用)
├── transitions: Int16Array  (大小 256，-1 表示无转移)
├── isAccept: boolean
└── acceptRule: number
```
