# 核心算法伪代码

## 字符编码

使用 **8-bit 字节流**（0-255），每个字符是一个 0-255 的整数。

---

## 1. Thompson 构造法

### 1.1 基本构造规则

```typescript
// 构造单个字符的 NFA
function buildChar(char: number): NFA {
    const nfa = new NFA();
    const start = nfa.newState();
    const accept = nfa.newState();

    // start --char--> accept
    start.transitions.push({ type: 'char', char, to: accept });
    accept.isAccept = true;

    nfa.start = start;
    nfa.accept = accept;
    nfa.states = [start, accept];

    return nfa;
}

// 构造字符类的 NFA
function buildClass(cls: CharClass): NFA {
    const nfa = new NFA();
    const start = nfa.newState();
    const accept = nfa.newState();

    // start --class--> accept
    start.transitions.push({ type: 'class', class: cls, to: accept });
    accept.isAccept = true;

    nfa.start = start;
    nfa.accept = accept;
    nfa.states = [start, accept];

    return nfa;
}

// 连接两个 NFA (ab)
function buildConcat(a: NFA, b: NFA): NFA {
    // a.accept --ε--> b.start
    a.accept.transitions.push({ type: 'epsilon', to: b.start });
    a.accept.isAccept = false;

    return new NFA(a.start, b.accept, [...a.states, ...b.states]);
}

// 并运算 (a|b)
function buildUnion(a: NFA, b: NFA): NFA {
    const nfa = new NFA();
    const start = nfa.newState();
    const accept = nfa.newState();

    // start --ε--> a.start
    // start --ε--> b.start
    start.transitions.push({ type: 'epsilon', to: a.start });
    start.transitions.push({ type: 'epsilon', to: b.start });

    // a.accept --ε--> accept
    // b.accept --ε--> accept
    a.accept.transitions.push({ type: 'epsilon', to: accept });
    b.accept.transitions.push({ type: 'epsilon', to: accept });

    a.accept.isAccept = false;
    b.accept.isAccept = false;
    accept.isAccept = true;

    nfa.start = start;
    nfa.accept = accept;
    nfa.states = [start, accept, ...a.states, ...b.states];

    return nfa;
}

// 闭包 (a*)
function buildStar(a: NFA): NFA {
    const nfa = new NFA();
    const start = nfa.newState();
    const accept = nfa.newState();

    // start --ε--> a.start
    // start --ε--> accept
    start.transitions.push({ type: 'epsilon', to: a.start });
    start.transitions.push({ type: 'epsilon', to: accept });

    // a.accept --ε--> a.start (循环)
    // a.accept --ε--> accept
    a.accept.transitions.push({ type: 'epsilon', to: a.start });
    a.accept.transitions.push({ type: 'epsilon', to: accept });

    a.accept.isAccept = false;
    accept.isAccept = true;

    nfa.start = start;
    nfa.accept = accept;
    nfa.states = [start, accept, ...a.states];

    return nfa;
}

// 正闭包 (a+) = aa*
function buildPlus(a: NFA): NFA {
    return buildConcat(a, buildStar(a.clone()));
}

// 可选 (a?) = a|ε
function buildOptional(a: NFA): NFA {
    const nfa = new NFA();
    const start = nfa.newState();
    const accept = nfa.newState();

    // start --ε--> a.start
    // start --ε--> accept
    start.transitions.push({ type: 'epsilon', to: a.start });
    start.transitions.push({ type: 'epsilon', to: accept });

    // a.accept --ε--> accept
    a.accept.transitions.push({ type: 'epsilon', to: accept });
    a.accept.isAccept = false;
    accept.isAccept = true;

    nfa.start = start;
    nfa.accept = accept;
    nfa.states = [start, accept, ...a.states];

    return nfa;
}

// 重复范围 {m,n}
function buildRange(a: NFA, min: number, max: number | null): NFA {
    // 空 NFA（匹配 ε）
    let result = buildOptional(new NFA());

    // 精确重复 min 次
    for (let i = 0; i < min; i++) {
        result = buildConcat(result, a.clone());
    }

    // 如果 max 为 null（{m,}），添加正闭包
    if (max === null) {
        result = buildConcat(result, buildPlus(a.clone()));
    } else {
        // 添加 (a|ε) (a|ε) ... 共 (max-min) 次
        for (let i = min; i < max; i++) {
            result = buildConcat(result, buildOptional(a.clone()));
        }
    }

    return result;
}
```

### 1.2 从 AST 构造 NFA

```typescript
function buildFromAST(ast: RegexAST): NFA {
    switch (ast.type) {
        case 'char':
            return buildChar(ast.char);
        case 'class':
            return buildClass(ast.class);
        case 'any':
            // 匹配任何字符（除换行外，可选）
            return buildClass({ negated: false, ranges: [[0, 255]], singles: [] });
        case 'concat':
            return buildConcat(buildFromAST(ast.left), buildFromAST(ast.right));
        case 'union':
            return buildUnion(buildFromAST(ast.left), buildFromAST(ast.right));
        case 'star':
            return buildStar(buildFromAST(ast.child));
        case 'plus':
            return buildPlus(buildFromAST(ast.child));
        case 'optional':
            return buildOptional(buildFromAST(ast.child));
        case 'range':
            return buildRange(buildFromAST(ast.child), ast.min, ast.max);
    }
}
```

---

## 2. 子集构造法（NFA → DFA）

```typescript
function subsetConstruction(nfa: NFA): DFA {
    const dfa = new DFA();

    // 状态集合 → DFA 状态 ID 的映射（使用 setKey 作为键）
    const visited = new Map<string, number>();

    // 工作队列（BFS）
    const worklist: Set<State>[] = [];

    // 初始状态 = NFA 起始状态的 ε-闭包
    const startSet = epsilonClosure(new Set([nfa.start]));
    const startId = dfa.addState(startSet);
    dfa.startStateId = startId;

    worklist.push(startSet);
    visited.set(setKey(startSet), startId);

    while (worklist.length > 0) {
        const current = worklist.shift()!;
        const fromId = visited.get(setKey(current))!;

        // 确定当前状态是否为接受状态
        // 如果有多个接受规则，取优先级最高的（编号最小的）
        let acceptRule = -1;
        for (const state of current) {
            if (state.isAccept) {
                if (acceptRule === -1 || state.acceptRule < acceptRule) {
                    acceptRule = state.acceptRule;
                }
            }
        }
        dfa.states[fromId].isAccept = acceptRule !== -1;
        dfa.states[fromId].acceptRule = acceptRule;

        // 对于每个可能的输入字符（优化：只考虑存在的转移）
        const chars = collectPossibleChars(current);

        for (const char of chars) {
            const next = epsilonClosure(move(current, char));

            if (next.size === 0) {
                dfa.states[fromId].transitions[char] = -1;
                continue;
            }

            const key = setKey(next);
            let toId = visited.get(key);

            if (toId === undefined) {
                toId = dfa.addState(next);
                visited.set(key, toId);
                worklist.push(next);
            }

            dfa.states[fromId].transitions[char] = toId;
        }
    }

    return dfa;
}

// ε-闭包：通过 ε-转移可达的所有状态
function epsilonClosure(states: Set<State>): Set<State> {
    const stack = Array.from(states);
    const closure = new Set(states);

    while (stack.length > 0) {
        const state = stack.pop()!;

        for (const trans of state.transitions) {
            if (trans.type === 'epsilon') {
                if (!closure.has(trans.to)) {
                    closure.add(trans.to);
                    stack.push(trans.to);
                }
            }
        }
    }

    return closure;
}

// Move：从状态集通过字符 c 能直接到达的状态（不计算 ε-闭包）
function move(states: Set<State>, char: number): Set<State> {
    const result = new Set<State>();

    for (const state of states) {
        for (const trans of state.transitions) {
            if (trans.type === 'char' && trans.char === char) {
                result.add(trans.to);
            } else if (trans.type === 'class' && matchesClass(char, trans.class)) {
                result.add(trans.to);
            }
        }
    }

    return result;
}

// 辅助函数：生成状态集合的唯一键
function setKey(states: Set<State>): string {
    const ids = Array.from(states).map(s => s.id).sort((a, b) => a - b);
    return ids.join(',');
}

// 优化：收集状态集合中所有可能的转移字符
// 避免对每个字符类都遍历 0-255
function collectPossibleChars(states: Set<State>): number[] {
    const chars = new Set<number>();

    for (const state of states) {
        for (const trans of state.transitions) {
            if (trans.type === 'char') {
                chars.add(trans.char);
            } else if (trans.type === 'class') {
                // 收集字符类中的所有可能字符
                for (const single of trans.class.singles) {
                    chars.add(single);
                }
                for (const [start, end] of trans.class.ranges) {
                    for (let c = start; c <= end; c++) {
                        chars.add(c);
                    }
                }
            }
        }
    }

    return Array.from(chars).sort((a, b) => a - b);
}
```

---

## 3. DFA 最小化（Hopcroft 算法）

```typescript
function minimize(dfa: DFA): DFA {
    // 初始化分区：接受状态（按规则分组）/ 非接受状态
    const partition = new Map<number, number>(); // 状态 ID -> 组 ID
    const groups: Set<number>[] = [];

    // 收集接受状态和非接受状态
    const acceptByRule = new Map<number, Set<number>>();
    const nonAcceptStates = new Set<number>();

    for (const state of dfa.states) {
        if (state.isAccept) {
            // 按 acceptRule 分组
            if (!acceptByRule.has(state.acceptRule)) {
                acceptByRule.set(state.acceptRule, new Set());
            }
            acceptByRule.get(state.acceptRule)!.add(state.id);
        } else {
            nonAcceptStates.add(state.id);
        }
    }

    // 初始化组：每个不同的 acceptRule 对应一组
    let groupId = 0;
    for (const [ruleId, states] of acceptByRule) {
        groups.push(states);
        for (const stateId of states) {
            partition.set(stateId, groupId);
        }
        groupId++;
    }

    // 非接受状态为一组
    if (nonAcceptStates.size > 0) {
        groups.push(nonAcceptStates);
        for (const stateId of nonAcceptStates) {
            partition.set(stateId, groupId);
        }
        groupId++;
    }

    // 工作队列：需要检查的分裂器（使用 Set 避免重复）
    const worklist = new Set<number>();
    for (let i = 0; i < groups.length; i++) {
        worklist.add(i);
    }

    // 主循环
    while (worklist.size > 0) {
        const A = worklist.values().next().value!;
        worklist.delete(A);

        // 对于每个可能的输入字符
        for (let c = 0; c < 256; c++) {
            // 找到通过 c 转移到 A 的状态
            const X = new Set<number>();
            for (const stateId of partition.keys()) {
                const nextId = dfa.states[stateId].transitions[c];
                if (nextId !== -1 && partition.get(nextId) === A) {
                    X.add(stateId);
                }
            }

            if (X.size === 0) continue;

            // 检查每个组是否需要分裂
            for (let g = 0; g < groups.length; g++) {
                const group = groups[g];
                const intersection = new Set<number>();
                const difference = new Set<number>();

                for (const stateId of group) {
                    if (X.has(stateId)) {
                        intersection.add(stateId);
                    } else {
                        difference.add(stateId);
                    }
                }

                if (intersection.size === 0 || difference.size === 0) {
                    continue; // 不需要分裂
                }

                // 分裂组：较小的留在原组，较大的放入新组
                if (intersection.size <= difference.size) {
                    groups[g] = intersection;
                    const newGroupId = groups.length;
                    groups.push(difference);

                    // 更新分区映射
                    for (const stateId of intersection) {
                        partition.set(stateId, g);
                    }
                    for (const stateId of difference) {
                        partition.set(stateId, newGroupId);
                    }

                    // 更新工作队列
                    if (worklist.has(g)) {
                        worklist.add(newGroupId);
                    } else {
                        worklist.add(intersection.size <= difference.size ? g : newGroupId);
                    }
                } else {
                    groups[g] = difference;
                    const newGroupId = groups.length;
                    groups.push(intersection);

                    // 更新分区映射
                    for (const stateId of difference) {
                        partition.set(stateId, g);
                    }
                    for (const stateId of intersection) {
                        partition.set(stateId, newGroupId);
                    }

                    // 更新工作队列
                    if (worklist.has(g)) {
                        worklist.add(newGroupId);
                    } else {
                        worklist.add(difference.size < intersection.size ? g : newGroupId);
                    }
                }
            }
        }
    }

    // 重建最小化 DFA
    return rebuildDFA(dfa, partition, groups);
}

// 重建 DFA
function rebuildDFA(
    oldDFA: DFA,
    partition: Map<number, number>,
    groups: Set<number>[]
): DFA {
    const newDFA = new DFA();

    // 组 ID -> 新状态 ID 的映射
    const groupToNewId = new Map<number, number>();

    // 创建新状态
    for (let g = 0; g < groups.length; g++) {
        const newId = newDFA.addState(new Set());
        groupToNewId.set(g, newId);

        // 复制接受状态信息（取组内第一个状态的信息）
        const firstStateId = Array.from(groups[g])[0];
        const oldState = oldDFA.states[firstStateId];
        newDFA.states[newId].isAccept = oldState.isAccept;
        newDFA.states[newId].acceptRule = oldState.acceptRule;
    }

    // 设置起始状态
    const oldStartGroup = partition.get(oldDFA.startStateId)!;
    newDFA.startStateId = groupToNewId.get(oldStartGroup)!;

    // 创建转移
    for (let g = 0; g < groups.length; g++) {
        const fromNewId = groupToNewId.get(g)!;
        const firstStateId = Array.from(groups[g])[0];
        const oldState = oldDFA.states[firstStateId];

        for (let c = 0; c < 256; c++) {
            const oldNextId = oldState.transitions[c];
            if (oldNextId !== -1) {
                const nextGroup = partition.get(oldNextId)!;
                const toNewId = groupToNewId.get(nextGroup)!;
                newDFA.states[fromNewId].transitions[c] = toNewId;
            }
        }
    }

    return newDFA;
}
```

---

## 4. 代码生成

```typescript
function generateToString(dfa: DFA, spec: LexSpec): string {
    const parts = generateParts(dfa, spec);

    return `/* Generated by SeuLex */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ===== User Header ===== */
${parts.header}

/* ===== Definitions ===== */
#define YY_NUM_STATES ${dfa.states.length}
#define YY_NUM_RULES ${spec.rules.length}

/* ===== Tables ===== */
${parts.transitionTable}

${parts.acceptTable}

/* ===== Global Variables ===== */
char *yytext = NULL;
int yyleng = 0;
FILE *yyin = NULL;
static char yy_buffer[8192];
static char *yy_buf_pos = NULL;
static int yy_buf_end = 0;

/* ===== Helper Functions ===== */
static int yy_getchar(void) {
    if (yy_buf_pos >= yy_buffer + yy_buf_end) {
        yy_buf_end = fread(yy_buffer, 1, sizeof(yy_buffer), yyin);
        yy_buf_pos = yy_buffer;
        if (yy_buf_end == 0) return EOF;
    }
    return *yy_buf_pos++;
}

static void yy_ungetchar(void) {
    if (yy_buf_pos > yy_buffer) yy_buf_pos--;
}

/* ===== Lexer Function ===== */
int yylex(void) {
    int state = ${dfa.startStateId};
    char *start = yy_buf_pos;
    int last_accept_pos = -1;
    int last_accept_state = -1;

    if (!yyin) yyin = stdin;

    while (1) {
        int c = yy_getchar();
        int next = (c == EOF) ? -1 : yy_next[state][c];

        if (next == -1) {
            /* 无转移，回退到最近接受状态 */
            if (last_accept_state != -1) {
                yy_buf_pos = yy_buffer + last_accept_pos;
                yyleng = last_accept_pos - (start - yy_buffer);
                yytext = malloc(yyleng + 1);
                memcpy(yytext, start, yyleng);
                yytext[yyleng] = '\\0';

                switch (yy_accept[last_accept_state]) {
${parts.actions}
                    default: return 0;
                }
            } else if (c == EOF) {
                return 0; /* EOF */
            } else {
                /* 错误：无法识别的字符 */
                fprintf(stderr, "Error: unexpected character '%c'\\n", c);
                return -1;
            }
        }

        if (yy_accept[next]) {
            last_accept_state = next;
            last_accept_pos = yy_buf_pos - yy_buffer;
        }

        state = next;
    }
}

/* ===== User Code ===== */
${parts.trailer}
`;
}

// 生成转移表
function generateTransitionTable(dfa: DFA): string {
    const lines: string[] = [];
    lines.push('static const int yy_next[YY_NUM_STATES][256] = {');

    for (const state of dfa.states) {
        const trans: string[] = [];
        for (let c = 0; c < 256; c++) {
            trans.push(state.transitions[c].toString());
        }
        lines.push(`    { ${trans.join(', ')} },`);
    }

    lines.push('};');
    return lines.join('\\n');
}

// 生成接受状态表
function generateAcceptTable(dfa: DFA): string {
    const accepts = dfa.states.map(s => s.acceptRule + 1); // 0 表示不接受
    return `static const int yy_accept[YY_NUM_STATES] = { ${accepts.join(', ')} };`;
}

// 生成动作代码
function generateActions(spec: LexSpec): string {
    const lines: string[] = [];

    for (let i = 0; i < spec.rules.length; i++) {
        lines.push(`                    case ${i + 1}:`);
        lines.push(`                        ${spec.rules[i].action}`);
        lines.push(`                        break;`);
    }

    return lines.join('\\n');
}
```
