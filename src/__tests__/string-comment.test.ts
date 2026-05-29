// src/__tests__/string-comment.test.ts
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

const FIXTURES_DIR = join(__dirname, '../../test-fixtures/string-comment');

describe('String and Comment Lexer Integration', () => {
    const fixtureDir = FIXTURES_DIR;

    test('加载 lexer.l 规范', () => {
        const spec = load(join(fixtureDir, 'lexer.l'));
        expect(spec.rules.length).toBeGreaterThan(0);
        expect(spec.definitions.length).toBe(0);
    });

    test('解析所有规则为正则 NFA', () => {
        const spec = load(join(fixtureDir, 'lexer.l'));
        const nfas = spec.rules.map(r => parse(r.pattern));
        expect(nfas.length).toBeGreaterThan(0);
        expect(nfas[0]).toBeDefined();
    });

    test('合并 NFA', () => {
        const spec = load(join(fixtureDir, 'lexer.l'));
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        expect(merged.states.length).toBeGreaterThan(0);
        expect(merged.start).toBeDefined();
    });

    test('子集构造生成 DFA', () => {
        const spec = load(join(fixtureDir, 'lexer.l'));
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = subsetConstruction(merged);
        expect(dfa.states.length).toBeGreaterThan(0);
        expect(dfa.startStateId).toBe(0);
    });

    test('DFA 最小化', () => {
        const spec = load(join(fixtureDir, 'lexer.l'));
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfaBefore = subsetConstruction(merged);
        const dfaAfter = minimize(dfaBefore);
        expect(dfaAfter.states.length).toBeLessThanOrEqual(dfaBefore.states.length);
        expect(dfaAfter.startStateId).toBe(0);
    });

    test('完整编译流程生成代码', () => {
        const spec = load(join(fixtureDir, 'lexer.l'));
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        expect(code).toContain('int yylex(void)');
        expect(code).toContain('yy_next[');
        expect(code).toContain('yy_accept[');
    });

    test('生成的代码包含 STRING token 处理', () => {
        const spec = load(join(fixtureDir, 'lexer.l'));
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        expect(code).toContain('return(STRING)');
    });

    test('生成的代码包含 IDENT token 处理', () => {
        const spec = load(join(fixtureDir, 'lexer.l'));
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        expect(code).toContain('return(IDENT)');
    });

    test('生成的代码包含 ERROR token 处理', () => {
        const spec = load(join(fixtureDir, 'lexer.l'));
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        expect(code).toContain('return(ERROR)');
    });

    test('验证输入文件和期望输出文件存在', () => {
        const inputPath = join(fixtureDir, 'input.txt');
        const expectedPath = join(fixtureDir, 'expected.txt');

        expect(() => readFileSync(inputPath, 'utf-8')).not.toThrow();
        expect(() => readFileSync(expectedPath, 'utf-8')).not.toThrow();
    });

    test('输入文件包含预期的测试用例', () => {
        const input = readFileSync(join(fixtureDir, 'input.txt'), 'utf-8');

        // 验证包含字符串
        expect(input).toContain('"hello world"');
        expect(input).toContain('"string with \\\\\"escaped quotes\\\\\""');

        // 验证包含单行注释
        expect(input).toContain('// this is a single line comment');

        // 验证包含多行注释
        expect(input).toContain('/* this is a');
        expect(input).toContain('multi-line comment */');

        // 验证边界情况：注释中的字符串和字符串中的注释
        expect(input).toContain('/* comment with "string" inside */');
        expect(input).toContain('"string with /* comment */ inside"');

        // 验证标识符
        expect(input).toContain('foo');
        expect(input).toContain('bar');
        expect(input).toContain('baz');
        expect(input).toContain('identifier123');
    });

    test('期望输出格式正确', () => {
        const expected = readFileSync(join(fixtureDir, 'expected.txt'), 'utf-8');
        const lines = expected.trim().split('\n').filter(line => line.length > 0);

        // 验证每一行都符合预期的格式 TOKEN: value
        for (const line of lines) {
            expect(line).toMatch(/^(STRING|IDENT|ERROR):\s*.+$/);
        }

        // 验证包含预期的 token 类型
        expect(expected).toContain('STRING:');
        expect(expected).toContain('IDENT:');

        // 验证特定的字符串 token
        expect(expected).toContain('"hello world"');
        expect(expected).toContain('"string with \\\"escaped quotes\\\""');

        // 验证标识符
        expect(expected).toContain('foo');
        expect(expected).toContain('bar');
        expect(expected).toContain('baz');
        expect(expected).toContain('identifier123');
    });

    test('注释在期望输出中被正确跳过', () => {
        const expected = readFileSync(join(fixtureDir, 'expected.txt'), 'utf-8');

        // 注释不应该出现在期望输出中
        expect(expected).not.toContain('// this is a single line comment');
        expect(expected).not.toContain('/* this is a');
        expect(expected).not.toContain('multi-line comment */');
    });

    test('快照测试：string-comment 生成的代码', () => {
        const spec = load(join(fixtureDir, 'lexer.l'));
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        const code = generateToString(dfa, spec);

        expect(code).toMatchSnapshot('string-comment-generated-lexer');
    });
});
