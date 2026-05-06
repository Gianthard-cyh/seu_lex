// src/reparser/index.test.ts
import { describe, test, expect } from 'vitest';
import { parse, RegexLexer, RegexParser } from './index.js';
import { RegexParseError } from '../errors.js';

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
        const trans = nfa.start.transitions[0] as { type: 'class', class: { negated: boolean } };
        expect(trans.class.negated).toBe(true);
    });

    test('解析点号', () => {
        const nfa = parse('.');
        expect(nfa.start.transitions[0].type).toBe('class');
    });
});

describe('ReParser - 量词', () => {
    test('解析闭包 (*)', () => {
        const nfa = parse('a*');
        const hasEpsilonToAccept = nfa.start.transitions.some(
            t => t.type === 'epsilon' && t.to === nfa.accept
        );
        expect(hasEpsilonToAccept).toBe(true);
    });

    test('解析正闭包 (+)', () => {
        const nfa = parse('a+');
        expect(nfa.start.transitions.some(t => t.type === 'char')).toBe(true);
    });

    test('解析可选 (?)', () => {
        const nfa = parse('a?');
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

describe('ReParser - 转义序列', () => {
    test('解析 \\n', () => {
        const nfa = parse('\\n');
        expect(nfa.start.transitions[0].type).toBe('char');
        const trans = nfa.start.transitions[0] as { type: 'char', char: number };
        expect(trans.char).toBe(10);
    });

    test('解析 \\t', () => {
        const nfa = parse('\\t');
        const trans = nfa.start.transitions[0] as { type: 'char', char: number };
        expect(trans.char).toBe(9);
    });

    test('解析字面量 \\*', () => {
        const nfa = parse('\\*');
        expect(nfa.start.transitions[0].type).toBe('char');
        const trans = nfa.start.transitions[0] as { type: 'char', char: number };
        expect(trans.char).toBe(42);
    });

    test('解析字面量 \\[', () => {
        const nfa = parse('\\[');
        const trans = nfa.start.transitions[0] as { type: 'char', char: number };
        expect(trans.char).toBe(91);
    });
});

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

describe('RegexLexer', () => {
    test('基本 token 识别', () => {
        const lexer = new RegexLexer('a*b+|c?');
        const tokens: string[] = [];
        let token = lexer.nextToken();
        while (token.type !== 'EOF') {
            tokens.push(token.type);
            token = lexer.nextToken();
        }
        expect(tokens).toContain('CHAR');
        expect(tokens).toContain('STAR');
        expect(tokens).toContain('PLUS');
        expect(tokens).toContain('PIPE');
        expect(tokens).toContain('QUESTION');
    });

    test('peek 不消耗 token', () => {
        const lexer = new RegexLexer('ab');
        const peeked = lexer.peek();
        expect(peeked.type).toBe('CHAR');
        const actual = lexer.nextToken();
        expect(actual.type).toBe('CHAR');
    });
});
