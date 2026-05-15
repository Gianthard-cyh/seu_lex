// src/__tests__/c99-integration.test.ts
import { describe, test, expect } from 'vitest';
import { load } from '../loader/index.js';
import { parse } from '../reparser/index.js';
import { merge } from '../merger/index.js';
import { simplify, subsetConstruction, minimize } from '../simplifier/index.js';
import { generateToString } from '../generator/index.js';

describe('C99 Lexer Integration', () => {
    test('加载 c99.l 规范', () => {
        const spec = load('./c99.l');
        expect(spec.definitions).toHaveLength(7);  // D, L, H, E, P, FS, IS
        expect(spec.rules).toHaveLength(99);  // 99 rules including // comment
        expect(spec.header).toContain('y.tab.h');
    });

    test('解析所有规则为正则 NFA', () => {
        const spec = load('./c99.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        expect(nfas).toHaveLength(99);
        expect(nfas[0]).toBeDefined();
        expect(nfas[98]).toBeDefined();
    });

    test('合并 NFA', () => {
        const spec = load('./c99.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        expect(merged.states.length).toBeGreaterThan(100);
        expect(merged.start).toBeDefined();
    });

    test('子集构造生成 DFA', () => {
        const spec = load('./c99.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = subsetConstruction(merged);
        expect(dfa.states.length).toBeGreaterThan(0);
        expect(dfa.startStateId).toBe(0);
    });

    test('DFA 最小化', () => {
        const spec = load('./c99.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfaBefore = subsetConstruction(merged);
        const dfaAfter = minimize(dfaBefore);
        expect(dfaAfter.states.length).toBeLessThanOrEqual(dfaBefore.states.length);
        expect(dfaAfter.startStateId).toBe(0);
    });

    test('完整编译流程生成代码', () => {
        const spec = load('./c99.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        expect(code).toContain('int yylex(void)');
        expect(code).toContain('yy_next[');
        expect(code).toContain('yy_accept[');
        expect(code).toContain('case 1:');
        expect(code).toContain('case 98:');
    });

    test('生成的代码包含所有关键字', () => {
        const spec = load('./c99.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        // 检查生成的代码是否包含关键字处理
        expect(code).toContain('return(INT)');
        expect(code).toContain('return(IF)');
        expect(code).toContain('return(ELSE)');
        expect(code).toContain('return(WHILE)');
        expect(code).toContain('return(RETURN)');
    });

    test('生成的代码包含操作符', () => {
        const spec = load('./c99.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        // 检查生成的代码是否包含操作符处理
        expect(code).toContain("return('+')");
        expect(code).toContain("return('-')");
        expect(code).toContain("return('=')");
        expect(code).toContain('return(ADD_ASSIGN)');
        expect(code).toContain('return(SUB_ASSIGN)');
    });

    test('生成的代码包含 Flex 兼容函数', () => {
        const spec = load('./c99.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        expect(code).toContain('int input(void)');
        expect(code).toContain('void unput(int c)');
        expect(code).toContain('void output(int c)');
        expect(code).toContain('yytext');
        expect(code).toContain('yyleng');
    });

    test('生成的代码包含运行时头文件引用', () => {
        const spec = load('./c99.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        expect(code).toContain('#include "yydefs.h"');
    });

    test('快照测试：c99.l 生成的代码', () => {
        const spec = load('./c99.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        // 使用快照测试验证生成的代码结构
        expect(code).toMatchSnapshot('c99-generated-lexer');
    });
});
