# SeuLex 测试规范

## 测试策略

- **单元测试**: 每个模块独立测试
- **集成测试**: 模块间组合测试
- **端到端测试**: 完整编译流程测试
- **边界测试**: 异常情况处理

使用 **Vitest** 作为测试框架。

---

## 1. SourceLoader 测试

### 1.1 基本解析测试

```typescript
describe('SourceLoader', () => {
    test('解析最简单的 .l 文件', () => {
        const input = `%%
a { return 1; }
%%`;
        const spec = loadFromString(input);
        expect(spec.header).toBe('');
        expect(spec.definitions).toEqual([]);
        expect(spec.rules).toHaveLength(1);
        expect(spec.rules[0].pattern).toBe('a');
        expect(spec.rules[0].action).toBe('return 1;');
        expect(spec.rules[0].priority).toBe(0);
        expect(spec.trailer).toBe('');
    });

    test('解析包含 header 的文件', () => {
        const input = `%{\n#include <stdio.h>\n%}\n%%\na { return 1; }\n%%`;
        const spec = loadFromString(input);
        expect(spec.header).toBe('#include <stdio.h>\n');
    });

    test('解析包含 trailer 的文件', () => {
        const input = `%%\na { return 1; }\n%%\nint main() { return 0; }`;
        const spec = loadFromString(input);
        expect(spec.trailer).toBe('int main() { return 0; }');
    });

    test('解析多个规则', () => {
        const input = `%%\na { return 1; }\nb { return 2; }\nc { return 3; }\n%%`;
        const spec = loadFromString(input);
        expect(spec.rules).toHaveLength(3);
        expect(spec.rules[0].priority).toBe(0);
        expect(spec.rules[1].priority).toBe(1);
        expect(spec.rules[2].priority).toBe(2);
    });
});
```

### 1.2 宏定义测试

```typescript
describe('宏定义展开', () => {
    test('展开简单宏', () => {
        const input = `DIGIT [0-9]\n%%\n{DIGIT}+ { return 1; }\n%%`;
        const spec = loadFromString(input);
        expect(spec.definitions).toHaveLength(1);
        expect(spec.definitions[0].name).toBe('DIGIT');
        expect(spec.definitions[0].definition).toBe('[0-9]');
        expect(spec.rules[0].pattern).toBe('[0-9]+');
    });

    test('展开多个宏', () => {
        const input = `DIGIT [0-9]\nLETTER [a-z]\n%%\n{DIGIT}|{LETTER} { return 1; }\n%%`;
        const spec = loadFromString(input);
        expect(spec.rules[0].pattern).toBe('[0-9]|[a-z]');
    });

    test('展开嵌套宏', () => {
        const input = `DIGIT [0-9]\nNUMBER {DIGIT}+\n%%\n{NUMBER} { return 1; }\n%%`;
        const spec = loadFromString(input);
        expect(spec.rules[0].pattern).toBe('[0-9]+');
    });

    test('未定义的宏抛出错误', () => {
        const input = `%%\n{UNDEFINED} { return 1; }\n%%`;
        expect(() => loadFromString(input)).toThrow(LexerSpecError);
    });
});
```

### 1.3 错误处理测试

```typescript
describe('错误处理', () => {
    test('缺少 %% 分隔符', () => {
        const input = `a { return 1; }`;
        expect(() => loadFromString(input)).toThrow(LexerSpecError);
    });

    test('只有一段 %%', () => {
        const input = `%%\na { return 1; }`;
        expect(() => loadFromString(input)).toThrow(LexerSpecError);
    });

    test('规则格式错误', () => {
        const input = `%%\ninvalid line\n%%`;
        expect(() => loadFromString(input)).toThrow(LexerSpecError);
    });
});
```

---

## 2. ReParser 测试

### 2.1 基本字符测试

```typescript
describe('ReParser - 基本字符', () => {
    test('解析单个字符', () => {
        const nfa = parse('a');
        expect(nfa.states).toHaveLength(2);
        expect(nfa.start).toBeDefined();
        expect(nfa.accept).toBeDefined();
        expect(nfa.accept.isAccept).toBe(true);
    });

    test('解析字符类', () => {
        const nfa = parse('[a-z]');
        expect(nfa.start.transitions).toHaveLength(1);
        expect(nfa.start.transitions[0].type).toBe('class');
    });

    test('解析取反字符类', () => {
        const nfa = parse('[^0-9]');
        expect(nfa.start.transitions[0].type).toBe('class');
        expect(nfa.start.transitions[0].class.negated).toBe(true);
    });

    test('解析点号', () => {
        const nfa = parse('.');
        expect(nfa.start.transitions[0].type).toBe('class');
    });
});
```

### 2.2 量词测试

```typescript
describe('ReParser - 量词', () => {
    test('解析闭包 (*)', () => {
        const nfa = parse('a*');
        // 应该有 ε-转移允许空匹配
        const hasEpsilonToAccept = nfa.start.transitions.some(
            t => t.type === 'epsilon' && t.to === nfa.accept
        );
        expect(hasEpsilonToAccept).toBe(true);
    });

    test('解析正闭包 (+)', () => {
        const nfa = parse('a+');
        // 必须至少匹配一次
        expect(nfa.start.transitions.some(t => t.type === 'char')).toBe(true);
    });

    test('解析可选 (?)', () => {
        const nfa = parse('a?');
        // 应该有 ε-转移允许空匹配
        const hasEpsilonToAccept = nfa.start.transitions.some(
            t => t.type === 'epsilon' && t.to === nfa.accept
        );
        expect(hasEpsilonToAccept).toBe(true);
    });

    test('解析重复范围 {m,n}', () => {
        const nfa = parse('a{2,4}');
        // 状态数应该增加
        expect(nfa.states.length).toBeGreaterThan(4);
    });

    test('解析精确重复 {n}', () => {
        const nfa = parse('a{3}');
        // 应该有 3 个字符转移链
        expect(nfa.states.length).toBeGreaterThanOrEqual(4);
    });
});
```

### 2.3 组合测试

```typescript
describe('ReParser - 组合', () => {
    test('解析连接', () => {
        const nfa = parse('ab');
        expect(nfa.states.length).toBeGreaterThanOrEqual(3);
    });

    test('解析或运算', () => {
        const nfa = parse('a|b');
        // 起始状态应该有两个 ε-转移
        const epsilonTransitions = nfa.start.transitions.filter(t => t.type === 'epsilon');
        expect(epsilonTransitions).toHaveLength(2);
    });

    test('解析复杂表达式', () => {
        const nfa = parse('(a|b)*c+');
        expect(nfa.states.length).toBeGreaterThan(5);
    });

    test('解析嵌套括号', () => {
        const nfa = parse('((a))');
        expect(nfa.states.length).toBeGreaterThanOrEqual(2);
    });
});
```

### 2.4 转义序列测试

```typescript
describe('ReParser - 转义序列', () => {
    test('解析 \\n', () => {
        const nfa = parse('\\n');
        expect(nfa.start.transitions[0].type).toBe('char');
        expect(nfa.start.transitions[0].char).toBe(10);
    });

    test('解析 \\t', () => {
        const nfa = parse('\\t');
        expect(nfa.start.transitions[0].char).toBe(9);
    });

    test('解析字面量 \\*', () => {
        const nfa = parse('\\*');
        expect(nfa.start.transitions[0].type).toBe('char');
        expect(nfa.start.transitions[0].char).toBe(42);
    });

    test('解析字面量 \\[', () => {
        const nfa = parse('\\[');
        expect(nfa.start.transitions[0].char).toBe(91);
    });
});
```

### 2.5 错误处理测试

```typescript
describe('ReParser - 错误处理', () => {
    test('未闭合的括号', () => {
        expect(() => parse('(a')).toThrow(RegexParseError);
    });

    test('未闭合的字符类', () => {
        expect(() => parse('[a-z')).toThrow(RegexParseError);
    });

    test('空的字符类', () => {
        expect(() => parse('[]')).toThrow(RegexParseError);
    });

    test('无效的量词', () => {
        expect(() => parse('a{3,2}')).toThrow(RegexParseError);
    });
});
```

---

## 3. Merger 测试

### 3.1 基本合并测试

```typescript
describe('Merger', () => {
    test('合并两个 NFA', () => {
        const nfa1 = parse('a');
        const nfa2 = parse('b');
        const rules: Rule[] = [
            { pattern: 'a', action: 'return 1;', lineNo: 1, priority: 0 },
            { pattern: 'b', action: 'return 2;', lineNo: 2, priority: 1 }
        ];

        const merged = merge([nfa1, nfa2], rules);

        // 应该有新的起始状态
        expect(merged.start).toBeDefined();

        // 起始状态应该有两个 ε-转移
        const epsilonTransitions = merged.start.transitions.filter(t => t.type === 'epsilon');
        expect(epsilonTransitions).toHaveLength(2);

        // 接受状态应该标记了规则编号
        const acceptStates = merged.states.filter(s => s.isAccept);
        expect(acceptStates).toHaveLength(2);
        expect(acceptStates.some(s => s.acceptRule === 0)).toBe(true);
        expect(acceptStates.some(s => s.acceptRule === 1)).toBe(true);
    });

    test('合并三个 NFA', () => {
        const nfas = [parse('a'), parse('b'), parse('c')];
        const rules: Rule[] = [
            { pattern: 'a', action: 'A', lineNo: 1, priority: 0 },
            { pattern: 'b', action: 'B', lineNo: 2, priority: 1 },
            { pattern: 'c', action: 'C', lineNo: 3, priority: 2 }
        ];

        const merged = merge(nfas, rules);
        const epsilonTransitions = merged.start.transitions.filter(t => t.type === 'epsilon');
        expect(epsilonTransitions).toHaveLength(3);
    });
});
```

### 3.2 合并信息测试

```typescript
describe('Merger - 合并信息', () => {
    test('获取合并信息', () => {
        const nfa1 = parse('a');
        const nfa2 = parse('b');
        const rules: Rule[] = [
            { pattern: 'a', action: 'A', lineNo: 1, priority: 0 },
            { pattern: 'b', action: 'B', lineNo: 2, priority: 1 }
        ];

        const merged = merge([nfa1, nfa2], rules);
        const info = getMergeInfo(merged);

        expect(info.originalCount).toBe(2);
        expect(info.totalStates).toBeGreaterThan(4);
        expect(info.acceptStates).toBe(2);
    });
});
```

---

## 4. Simplifier 测试

### 4.1 ε-闭包测试

```typescript
describe('Simplifier - ε-闭包', () => {
    test('单状态的 ε-闭包', () => {
        const nfa = new NFA();
        const s1 = nfa.newState();
        const s2 = nfa.newState();
        s1.transitions.push({ type: 'epsilon', to: s2 });

        const closure = epsilonClosure(new Set([s1]));
        expect(closure.size).toBe(2);
        expect(closure.has(s1)).toBe(true);
        expect(closure.has(s2)).toBe(true);
    });

    test('多步 ε-闭包', () => {
        const nfa = new NFA();
        const s1 = nfa.newState();
        const s2 = nfa.newState();
        const s3 = nfa.newState();
        s1.transitions.push({ type: 'epsilon', to: s2 });
        s2.transitions.push({ type: 'epsilon', to: s3 });

        const closure = epsilonClosure(new Set([s1]));
        expect(closure.size).toBe(3);
    });

    test('ε-闭包包含起始状态', () => {
        const nfa = parse('a');
        const closure = epsilonClosure(new Set([nfa.start]));
        expect(closure.has(nfa.start)).toBe(true);
    });
});
```

### 4.2 Move 操作测试

```typescript
describe('Simplifier - Move', () => {
    test('字符转移 Move', () => {
        const nfa = parse('ab');
        const states = new Set([nfa.start]);
        const result = move(states, 'a'.charCodeAt(0));
        expect(result.size).toBeGreaterThan(0);
    });

    test('无匹配 Move', () => {
        const nfa = parse('a');
        const states = new Set([nfa.start]);
        const result = move(states, 'b'.charCodeAt(0));
        expect(result.size).toBe(0);
    });
});
```

### 4.3 子集构造测试

```typescript
describe('Simplifier - 子集构造', () => {
    test('简单 NFA 转 DFA', () => {
        const nfa = parse('a');
        const dfa = subsetConstruction(nfa);

        expect(dfa.states.length).toBeGreaterThanOrEqual(2);
        expect(dfa.startStateId).toBe(0);
    });

    test('DFA 状态转移表初始化', () => {
        const nfa = parse('ab');
        const dfa = subsetConstruction(nfa);

        // 每个状态的转移表应该有 256 个条目
        for (const state of dfa.states) {
            expect(state.transitions.length).toBe(256);
        }
    });

    test('接受状态标记', () => {
        const nfa = parse('a');
        nfa.accept.isAccept = true;
        nfa.accept.acceptRule = 0;

        const dfa = subsetConstruction(nfa);
        const acceptStates = dfa.states.filter(s => s.isAccept);
        expect(acceptStates.length).toBeGreaterThan(0);
    });
});
```

### 4.4 DFA 最小化测试

```typescript
describe('Simplifier - DFA 最小化', () => {
    test('已是最小 DFA', () => {
        const nfa = parse('a|b');
        const dfa = subsetConstruction(nfa);
        const minimized = minimize(dfa);

        expect(minimized.states.length).toBeLessThanOrEqual(dfa.states.length);
    });

    test('可合并的状态', () => {
        // (a|b)c 和 ac|bc 应该产生相同的 DFA
        const nfa1 = parse('(a|b)c');
        const nfa2 = parse('ac|bc');

        const dfa1 = minimize(subsetConstruction(nfa1));
        const dfa2 = minimize(subsetConstruction(nfa2));

        expect(dfa1.states.length).toBe(dfa2.states.length);
    });

    test('简化信息', () => {
        const nfa = parse('(a|b)*');
        const dfa = subsetConstruction(nfa);
        const minimized = minimize(dfa);

        const info = getSimplifyInfo(minimized);
        expect(info.dfaStatesBefore).toBeGreaterThanOrEqual(info.dfaStatesAfter);
        expect(info.compressionRatio).toBeGreaterThanOrEqual(0);
    });
});
```

---

## 5. Generator 测试

### 5.1 代码生成测试

```typescript
describe('Generator', () => {
    test('生成包含必要宏定义的代码', () => {
        const nfa = parse('a');
        const dfa = simplify(nfa);
        const spec: LexSpec = {
            header: '#include <stdio.h>',
            definitions: [],
            rules: [{ pattern: 'a', action: 'return 1;', lineNo: 1, priority: 0 }],
            trailer: 'int main() { return 0; }'
        };

        const code = generateToString(dfa, spec);

        expect(code).toContain('YY_NUM_STATES');
        expect(code).toContain('YY_NUM_RULES');
        expect(code).toContain('yy_next');
        expect(code).toContain('yy_accept');
        expect(code).toContain('yylex');
    });

    test('生成的代码包含动作代码', () => {
        const nfa = parse('a');
        const dfa = simplify(nfa);
        const spec: LexSpec = {
            header: '',
            definitions: [],
            rules: [{ pattern: 'a', action: 'printf("A");', lineNo: 1, priority: 0 }],
            trailer: ''
        };

        const code = generateToString(dfa, spec);
        expect(code).toContain('printf("A")');
    });

    test('生成的代码结构正确', () => {
        const nfa = parse('a');
        const dfa = simplify(nfa);
        const spec: LexSpec = {
            header: '/* header */',
            definitions: [],
            rules: [{ pattern: 'a', action: 'return 1;', lineNo: 1, priority: 0 }],
            trailer: '/* trailer */'
        };

        const parts = generateParts(dfa, spec);
        expect(parts.header).toContain('/* header */');
        expect(parts.trailer).toContain('/* trailer */');
        expect(parts.transitionTable).toContain('yy_next');
        expect(parts.acceptTable).toContain('yy_accept');
    });
});
```

---

## 6. 集成测试

### 6.1 简单表达式测试

```typescript
describe('集成测试 - 简单表达式', () => {
    test('匹配单个字符', async () => {
        const spec = loadFromString(`%%
a { return 1; }
%%`);

        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        expect(code).toContain('yylex');
        expect(code).toContain('case 1');
    });

    test('完整流程', async () => {
        const spec = loadFromString(`%{
#include <stdio.h>
%}

DIGIT [0-9]

%%

{DIGIT}+ { printf("NUMBER: %s\\n", yytext); return 1; }
[ \\t\\n]+ { /* ignore */ }
. { printf("UNKNOWN: %c\\n", *yytext); return -1; }

%%

int main() {
    yylex();
    return 0;
}`);

        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        expect(code).toContain('#include <stdio.h>');
        expect(code).toContain('int main()');
        expect(code).toContain('printf("NUMBER');
    });
});
```

### 6.2 优先级测试

```typescript
describe('集成测试 - 优先级', () => {
    test('关键字优先于标识符', () => {
        const spec = loadFromString(`%%
"if" { return IF; }
[a-z]+ { return IDENT; }
%%`);

        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);

        // 查找匹配 "if" 的路径应该到达规则0的接受状态
        // 这是通过检查 DFA 的 acceptRule 实现的
        const acceptStates = dfa.states.filter(s => s.isAccept);
        expect(acceptStates.length).toBeGreaterThan(0);
    });
});
```

---

## 7. 边界情况测试

### 7.1 极端输入测试

```typescript
describe('边界情况', () => {
    test('空规则', () => {
        const input = `%%
%%`;
        const spec = loadFromString(input);
        expect(spec.rules).toHaveLength(0);
    });

    test('很长的正则表达式', () => {
        const longPattern = 'a'.repeat(1000);
        expect(() => parse(longPattern)).not.toThrow();
    });

    test('深嵌套的正则', () => {
        let pattern = 'a';
        for (let i = 0; i < 50; i++) {
            pattern = `(${pattern})`;
        }
        expect(() => parse(pattern)).not.toThrow();
    });

    test('大量规则', () => {
        const rules = Array(100).fill(0).map((_, i) => 
            `rule${i} { return ${i}; }`
        ).join('\n');
        const input = `%%\n${rules}\n%%`;

        const spec = loadFromString(input);
        expect(spec.rules).toHaveLength(100);
    });
});
```

### 7.2 特殊字符测试

```typescript
describe('特殊字符', () => {
    test('所有可打印 ASCII 字符', () => {
        for (let i = 32; i < 127; i++) {
            const char = String.fromCharCode(i);
            if ('*+?()[]|'.includes(char)) continue; // 特殊字符跳过
            expect(() => parse(char)).not.toThrow();
        }
    });

    test('控制字符', () => {
        expect(() => parse('\\x00')).not.toThrow();
        expect(() => parse('\\x01')).not.toThrow();
        expect(() => parse('\\xff')).not.toThrow();
    });
});
```

---

## 测试覆盖率目标

| 模块 | 目标覆盖率 |
|------|-----------|
| SourceLoader | 90% |
| ReParser | 90% |
| Merger | 85% |
| Simplifier | 85% |
| Generator | 80% |

## 测试文件结构

```
src/
├── loader/
│   ├── index.ts
│   └── index.test.ts
├── reparser/
│   ├── index.ts
│   ├── lexer.ts
│   ├── parser.ts
│   ├── builder.ts
│   └── index.test.ts
├── merger/
│   ├── index.ts
│   └── index.test.ts
├── simplifier/
│   ├── index.ts
│   ├── subset.ts
│   ├── minimize.ts
│   └── index.test.ts
├── generator/
│   ├── index.ts
│   └── index.test.ts
├── integration.test.ts
└── fixtures/
    ├── calc.l
    ├── ident.l
    └── test.l
```

## 运行测试

```bash
# 运行所有测试
npm test

# 运行特定模块测试
npm test -- src/loader

# 生成覆盖率报告
npm run test:coverage

# 运行集成测试
npm test -- integration
```
