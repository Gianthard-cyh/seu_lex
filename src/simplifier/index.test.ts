// src/simplifier/index.test.ts
import { describe, test, expect } from 'vitest';
import { epsilonClosure, move, subsetConstruction, minimize, simplify } from './index.js';
import { parse } from '../reparser/index.js';
import { NFA, State } from '../types.js';

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

describe('Simplifier - DFA 最小化', () => {
    test('已是最小 DFA', () => {
        const nfa = parse('a|b');
        const dfa = subsetConstruction(nfa);
        const minimized = minimize(dfa);

        expect(minimized.states.length).toBeLessThanOrEqual(dfa.states.length);
    });

    test('可合并的状态', () => {
        const nfa1 = parse('(a|b)c');
        const nfa2 = parse('ac|bc');

        const dfa1 = minimize(subsetConstruction(nfa1));
        const dfa2 = minimize(subsetConstruction(nfa2));

        expect(dfa1.states.length).toBe(dfa2.states.length);
    });
});

describe('Simplifier - simplify', () => {
    test('simplify 完整流程', () => {
        const nfa = parse('(a|b)*');
        const dfa = simplify(nfa);

        expect(dfa.states.length).toBeGreaterThan(0);
        expect(dfa.startStateId).toBeGreaterThanOrEqual(0);
    });
});
