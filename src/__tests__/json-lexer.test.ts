// src/__tests__/json-lexer.test.ts
import { describe, test, expect } from 'vitest';
import { load } from '../loader/index.js';
import { parse } from '../reparser/index.js';
import { merge } from '../merger/index.js';
import { simplify, subsetConstruction, minimize } from '../simplifier/index.js';
import { generateToString } from '../generator/index.js';

describe('JSON Lexer Integration', () => {
    test('加载 json lexer.l 规范', () => {
        const spec = load('./test-fixtures/json-lexer/lexer.l');
        expect(spec.definitions.length).toBeGreaterThan(0);  // DIGIT, HEX, ESC, STRING_CHAR, INT, EXP
        expect(spec.rules.length).toBeGreaterThan(10);  // Rules for whitespace, string, number, keywords, punctuation
        expect(spec.header).toContain('json_tokens.h');
    });

    test('解析所有规则为正则 NFA', () => {
        const spec = load('./test-fixtures/json-lexer/lexer.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        expect(nfas.length).toBeGreaterThan(10);
        expect(nfas[0]).toBeDefined();
        expect(nfas[nfas.length - 1]).toBeDefined();
    });

    test('合并 NFA', () => {
        const spec = load('./test-fixtures/json-lexer/lexer.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        expect(merged.states.length).toBeGreaterThan(20);
        expect(merged.start).toBeDefined();
    });

    test('子集构造生成 DFA', () => {
        const spec = load('./test-fixtures/json-lexer/lexer.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = subsetConstruction(merged);
        expect(dfa.states.length).toBeGreaterThan(0);
        expect(dfa.startStateId).toBe(0);
    });

    test('DFA 最小化', () => {
        const spec = load('./test-fixtures/json-lexer/lexer.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfaBefore = subsetConstruction(merged);
        const dfaAfter = minimize(dfaBefore);
        expect(dfaAfter.states.length).toBeLessThanOrEqual(dfaBefore.states.length);
        expect(dfaAfter.startStateId).toBe(0);
    });

    test('完整编译流程生成代码', () => {
        const spec = load('./test-fixtures/json-lexer/lexer.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        expect(code).toContain('int yylex(void)');
        expect(code).toContain('yy_next[');
        expect(code).toContain('yy_accept[');
        // Check for action cases (rule numbers)
        expect(code).toContain('case 1:');
        expect(code).toContain('case 2:');
    });

    test('生成的代码包含 JSON 关键字', () => {
        const spec = load('./test-fixtures/json-lexer/lexer.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        // Check generated code contains keyword returns
        expect(code).toContain('return TRUE');
        expect(code).toContain('return FALSE');
        expect(code).toContain('return NULL_TOKEN');
    });

    test('生成的代码包含 JSON 标点符号', () => {
        const spec = load('./test-fixtures/json-lexer/lexer.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        expect(code).toContain('return LBRACE');
        expect(code).toContain('return RBRACE');
        expect(code).toContain('return LBRACKET');
        expect(code).toContain('return RBRACKET');
        expect(code).toContain('return COLON');
        expect(code).toContain('return COMMA');
    });

    test('生成的代码包含字符串处理', () => {
        const spec = load('./test-fixtures/json-lexer/lexer.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        // JSON strings support escape sequences including Unicode
        expect(code).toContain('return STRING');
    });

    test('生成的代码包含数字处理', () => {
        const spec = load('./test-fixtures/json-lexer/lexer.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        // JSON numbers: integers, decimals, negative, exponent
        expect(code).toContain('return NUMBER');
    });

    test('生成的代码包含错误处理', () => {
        const spec = load('./test-fixtures/json-lexer/lexer.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        // Error token for unmatched characters
        expect(code).toContain('return ERROR');
    });

    test('生成的代码包含 Flex 兼容函数', () => {
        const spec = load('./test-fixtures/json-lexer/lexer.l');
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
        const spec = load('./test-fixtures/json-lexer/lexer.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        expect(code).toContain('#include "yydefs.h"');
    });

    test('快照测试：json.l 生成的代码', () => {
        const spec = load('./test-fixtures/json-lexer/lexer.l');
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        // 使用快照测试验证生成的代码结构
        expect(code).toMatchSnapshot('json-generated-lexer');
    });
});
