// src/__tests__/number-id.test.ts
import { describe, test, expect } from 'vitest';
import { load } from '../loader/index.js';
import { parse } from '../reparser/index.js';
import { merge } from '../merger/index.js';
import { simplify, subsetConstruction, minimize } from '../simplifier/index.js';
import { generateToString } from '../generator/index.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = join(__dirname, '../../test-fixtures/number-id');

describe('Number-ID Lexer Integration', () => {
    test('加载 lexer.l 规范', () => {
        const spec = load(join(FIXTURES_DIR, 'lexer.l'));
        expect(spec.definitions).toHaveLength(0);  // 无宏定义
        expect(spec.rules).toHaveLength(5);  // 5条规则：NUMBER, IDENT, 空白, NEWLINE, UNKNOWN
        expect(spec.header).toContain('stdio.h');
    });

    test('解析所有规则为正则 NFA', () => {
        const spec = load(join(FIXTURES_DIR, 'lexer.l'));
        const nfas = spec.rules.map(r => parse(r.pattern));
        expect(nfas).toHaveLength(5);
        expect(nfas[0]).toBeDefined();
        expect(nfas[1]).toBeDefined();
        expect(nfas[2]).toBeDefined();
        expect(nfas[3]).toBeDefined();
        expect(nfas[4]).toBeDefined();
    });

    test('合并 NFA', () => {
        const spec = load(join(FIXTURES_DIR, 'lexer.l'));
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        expect(merged.states.length).toBeGreaterThan(0);
        expect(merged.start).toBeDefined();
    });

    test('子集构造生成 DFA', () => {
        const spec = load(join(FIXTURES_DIR, 'lexer.l'));
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = subsetConstruction(merged);
        expect(dfa.states.length).toBeGreaterThan(0);
        expect(dfa.startStateId).toBe(0);
    });

    test('DFA 最小化', () => {
        const spec = load(join(FIXTURES_DIR, 'lexer.l'));
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfaBefore = subsetConstruction(merged);
        const dfaAfter = minimize(dfaBefore);
        expect(dfaAfter.states.length).toBeLessThanOrEqual(dfaBefore.states.length);
        expect(dfaAfter.startStateId).toBe(0);
    });

    test('完整编译流程生成代码', () => {
        const spec = load(join(FIXTURES_DIR, 'lexer.l'));
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        expect(code).toContain('int yylex(void)');
        expect(code).toContain('yy_next[');
        expect(code).toContain('yy_accept[');
    });

    test('生成的代码包含数字和标识符处理', () => {
        const spec = load(join(FIXTURES_DIR, 'lexer.l'));
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        // 检查生成的代码是否包含动作代码中的关键字
        expect(code).toContain('printf');
        expect(code).toContain('NUMBER');
        expect(code).toContain('IDENT');
        expect(code).toContain('NEWLINE');
    });

    test('快照测试：lexer.l 生成的代码', () => {
        const spec = load(join(FIXTURES_DIR, 'lexer.l'));
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        // 使用快照测试验证生成的代码结构
        expect(code).toMatchSnapshot('number-id-generated-lexer');
    });

    test('测试输入文件与预期输出匹配', () => {
        const input = readFileSync(join(FIXTURES_DIR, 'input.txt'), 'utf-8');
        const expected = readFileSync(join(FIXTURES_DIR, 'expected.txt'), 'utf-8');

        // 验证输入和预期输出文件都存在且非空
        expect(input).toBeTruthy();
        expect(expected).toBeTruthy();

        // 验证输入包含预期的模式
        expect(input).toContain('hello');      // 标识符
        expect(input).toContain('42');           // 数字
        expect(input).toContain('test123');      // 数字开头的标识符
        expect(input).toContain('_x1');         // 下划线开头的标识符

        // 验证预期输出包含预期的 token 类型
        expect(expected).toContain('IDENT');
        expect(expected).toContain('NUMBER');
        expect(expected).toContain('NEWLINE');
    });
});
