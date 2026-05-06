// src/merger/index.test.ts
import { describe, test, expect } from 'vitest';
import { merge, getMergeInfo } from './index.js';
import { parse } from '../reparser/index.js';
import type { Rule } from '../types.js';

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

    test('单个 NFA', () => {
        const nfa = parse('a');
        const rules: Rule[] = [
            { pattern: 'a', action: 'return 1;', lineNo: 1, priority: 0 }
        ];

        const merged = merge([nfa], rules);
        expect(merged.states).toHaveLength(2);
    });

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
