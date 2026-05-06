// src/reparser/builder.ts
import { NFA, State, RegexAST, CharClass } from '../types.js';

// 构造单个字符的 NFA
function buildChar(char: number): NFA {
    const nfa = new NFA();
    const start = nfa.newState();
    const accept = nfa.newState();

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

    start.transitions.push({ type: 'class', class: cls, to: accept });
    accept.isAccept = true;

    nfa.start = start;
    nfa.accept = accept;
    nfa.states = [start, accept];

    return nfa;
}

// 重新分配 NFA 状态 ID，确保连续且不重复
function renumberNFA(nfa: NFA): NFA {
    const stateMap = new Map<State, State>();
    const newStates: State[] = [];
    let nextId = 0;

    for (const s of nfa.states) {
        if (!stateMap.has(s)) {
            const ns = new State(nextId++);
            ns.isAccept = s.isAccept;
            ns.acceptRule = s.acceptRule;
            stateMap.set(s, ns);
            newStates.push(ns);
        }
    }

    for (const s of nfa.states) {
        const ns = stateMap.get(s)!;
        for (const t of s.transitions) {
            const target = stateMap.get(t.to)!;
            if (t.type === 'epsilon') {
                ns.transitions.push({ type: 'epsilon', to: target });
            } else if (t.type === 'char') {
                ns.transitions.push({ type: 'char', char: t.char, to: target });
            } else {
                ns.transitions.push({ type: 'class', class: t.class, to: target });
            }
        }
    }

    return new NFA(
        stateMap.get(nfa.start)!,
        stateMap.get(nfa.accept)!,
        newStates
    );
}

// 连接两个 NFA (ab)
function buildConcat(a: NFA, b: NFA): NFA {
    // 克隆以避免修改原始 NFA
    const aClone = a.clone();
    const bClone = b.clone();

    aClone.accept.transitions.push({ type: 'epsilon', to: bClone.start });
    aClone.accept.isAccept = false;

    const result = new NFA(aClone.start, bClone.accept, [...aClone.states, ...bClone.states]);
    return renumberNFA(result);
}

// 并运算 (a|b)
function buildUnion(a: NFA, b: NFA): NFA {
    // 克隆以避免修改原始 NFA
    const aClone = a.clone();
    const bClone = b.clone();

    const nfa = new NFA();
    const start = nfa.newState();
    const accept = nfa.newState();

    start.transitions.push({ type: 'epsilon', to: aClone.start });
    start.transitions.push({ type: 'epsilon', to: bClone.start });

    aClone.accept.transitions.push({ type: 'epsilon', to: accept });
    bClone.accept.transitions.push({ type: 'epsilon', to: accept });

    aClone.accept.isAccept = false;
    bClone.accept.isAccept = false;
    accept.isAccept = true;

    nfa.start = start;
    nfa.accept = accept;
    nfa.states = [start, accept, ...aClone.states, ...bClone.states];

    return nfa;
}

// 闭包 (a*)
function buildStar(a: NFA): NFA {
    // 克隆以避免修改原始 NFA
    const aClone = a.clone();

    const nfa = new NFA();
    const start = nfa.newState();
    const accept = nfa.newState();

    start.transitions.push({ type: 'epsilon', to: aClone.start });
    start.transitions.push({ type: 'epsilon', to: accept });

    aClone.accept.transitions.push({ type: 'epsilon', to: aClone.start });
    aClone.accept.transitions.push({ type: 'epsilon', to: accept });

    aClone.accept.isAccept = false;
    accept.isAccept = true;

    nfa.start = start;
    nfa.accept = accept;
    nfa.states = [start, accept, ...aClone.states];

    return nfa;
}

// 正闭包 (a+) = aa*
function buildPlus(a: NFA): NFA {
    // 使用克隆避免修改原始 NFA
    const a1 = a.clone();
    const a2 = a.clone();
    return buildConcat(a1, buildStar(a2));
}

// 可选 (a?) = a|ε
function buildOptional(a: NFA): NFA {
    // 克隆以避免修改原始 NFA
    const aClone = a.clone();

    const nfa = new NFA();
    const start = nfa.newState();
    const accept = nfa.newState();

    start.transitions.push({ type: 'epsilon', to: aClone.start });
    start.transitions.push({ type: 'epsilon', to: accept });

    aClone.accept.transitions.push({ type: 'epsilon', to: accept });
    aClone.accept.isAccept = false;
    accept.isAccept = true;

    nfa.start = start;
    nfa.accept = accept;
    nfa.states = [start, accept, ...aClone.states];

    return nfa;
}

// 匹配任意字符 (.)
function buildAny(): NFA {
    const cls: CharClass = { negated: false, ranges: [[0, 255]], singles: [] };
    return buildClass(cls);
}

// 重复范围 {m,n}
function buildRange(a: NFA, min: number, max: number | null): NFA {
    // 精确重复 min 次
    let result: NFA = new NFA();

    for (let i = 0; i < min; i++) {
        result = buildConcat(result, a.clone());
    }

    // 如果 max 为 null（{m,}），添加正闭包
    if (max === null) {
        result = buildConcat(result, buildPlus(a.clone()));
    } else {
        // 添加 (a|ε) 共 (max-min) 次
        for (let i = min; i < max; i++) {
            result = buildConcat(result, buildOptional(a.clone()));
        }
    }

    return result;
}

// 从 AST 构造 NFA
export function buildFromAST(ast: RegexAST): NFA {
    switch (ast.type) {
        case 'char':
            return buildChar(ast.char);
        case 'class':
            return buildClass(ast.class);
        case 'any':
            return buildAny();
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
        default:
            throw new Error(`Unknown AST type: ${(ast as any).type}`);
    }
}
