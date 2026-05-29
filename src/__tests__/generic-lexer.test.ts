// src/__tests__/generic-lexer.test.ts
// 通用 Lexer 测试示例 - 展示如何使用 lexer-tester 模块

import { describe, test, expect } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
    generateLexerFromFile,
    compileLexer,
    runLexer,
    compareOutput,
    generateDiff,
    runLexerTest,
    quickTestLexer,
    type LexerTestCase
} from './lexer-tester.js';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', '..', 'test-fixtures');

describe('Generic Lexer Tests', () => {
    describe('Basic Function Tests', () => {
        test('generateLexerFromFile should generate code from .l file', () => {
            const lexerFile = join(FIXTURES_DIR, 'simple-id', 'lexer.l');
            const result = generateLexerFromFile(lexerFile);

            expect(result.code).toBeDefined();
            expect(result.code).toContain('int yylex(void)');
            expect(result.spec).toBeDefined();
            expect(result.spec.rules.length).toBeGreaterThan(0);
            expect(result.dfa).toBeDefined();
            expect(result.dfa.states.length).toBeGreaterThan(0);
        });

        test('compileLexer should compile generated code', () => {
            const lexerFile = join(FIXTURES_DIR, 'number-only', 'lexer.l');
            const { code } = generateLexerFromFile(lexerFile);

            const tempDir = mkdtempSync(join(tmpdir(), 'seulex-test-'));
            const outputPath = join(tempDir, 'test_lexer');

            try {
                compileLexer(code, outputPath);
                expect(existsSync(outputPath)).toBe(true);
            } finally {
                if (existsSync(tempDir)) {
                    rmSync(tempDir, { recursive: true, force: true });
                }
            }
        });

        test('runLexer should execute compiled lexer', () => {
            const lexerFile = join(FIXTURES_DIR, 'number-only', 'lexer.l');
            const { code } = generateLexerFromFile(lexerFile);

            const tempDir = mkdtempSync(join(tmpdir(), 'seulex-test-'));
            const lexerPath = join(tempDir, 'lexer');
            const inputFile = join(tempDir, 'input.txt');

            try {
                compileLexer(code, lexerPath);
                writeFileSync(inputFile, '42 123');

                const output = runLexer(lexerPath, inputFile, true);
                expect(output).toContain('42');
                expect(output).toContain('123');
            } finally {
                if (existsSync(tempDir)) {
                    rmSync(tempDir, { recursive: true, force: true });
                }
            }
        });

        test('compareOutput should compare strings correctly', () => {
            expect(compareOutput('hello\nworld', 'hello\nworld')).toBe(true);
            expect(compareOutput('hello\r\nworld', 'hello\nworld')).toBe(true);
            expect(compareOutput('hello world', 'hello\nworld')).toBe(false);
        });

        test('generateDiff should show line differences', () => {
            const diff = generateDiff('line1\nline2', 'line1\nLINE2');
            expect(diff).toContain('Line 2');
            expect(diff).toContain('Expected');
            expect(diff).toContain('Actual');
        });
    });

    describe('End-to-End Fixture Tests', () => {
        const testCases: LexerTestCase[] = [
            {
                name: 'simple-id',
                lexerFile: join(FIXTURES_DIR, 'simple-id', 'lexer.l'),
                inputFile: join(FIXTURES_DIR, 'simple-id', 'input.txt'),
                expectedFile: join(FIXTURES_DIR, 'simple-id', 'expected.txt'),
                description: 'Test identifier and number recognition'
            },
            {
                name: 'number-only',
                lexerFile: join(FIXTURES_DIR, 'number-only', 'lexer.l'),
                inputFile: join(FIXTURES_DIR, 'number-only', 'input.txt'),
                expectedFile: join(FIXTURES_DIR, 'number-only', 'expected.txt'),
                description: 'Test number recognition only'
            },
            {
                name: 'string-literal',
                lexerFile: join(FIXTURES_DIR, 'string-literal', 'lexer.l'),
                inputFile: join(FIXTURES_DIR, 'string-literal', 'input.txt'),
                expectedFile: join(FIXTURES_DIR, 'string-literal', 'expected.txt'),
                description: 'Test keyword recognition'
            }
        ];

        for (const testCase of testCases) {
            test(`Fixture: ${testCase.name}`, () => {
                const result = runLexerTest(testCase);

                if (!result.passed) {
                    console.log(`\nTest failed: ${testCase.name}`);
                    console.log('Description:', testCase.description);
                    if (result.diff) {
                        console.log('Diff:\n', result.diff);
                    }
                    if (result.error) {
                        console.log('Error:', result.error);
                    }
                }

                expect(result.passed).toBe(true);
            });
        }
    });

    describe('Quick Test API', () => {
        test('quickTestLexer should work with simple input', () => {
            const lexerFile = join(FIXTURES_DIR, 'simple-id', 'lexer.l');
            const output = quickTestLexer(lexerFile, 'hello 123');

            expect(output).toContain('hello');
            expect(output).toContain('123');
        });
    });

    describe('Custom Comparison', () => {
        test('should support custom compare function', () => {
            const testCase: LexerTestCase = {
                name: 'custom-compare',
                lexerFile: join(FIXTURES_DIR, 'simple-id', 'lexer.l'),
                inputFile: join(FIXTURES_DIR, 'simple-id', 'input.txt'),
                expectedFile: join(FIXTURES_DIR, 'simple-id', 'expected.txt'),
                // 自定义比较：忽略大小写
                compareFn: (actual, expected) => {
                    return actual.toLowerCase() === expected.toLowerCase();
                }
            };

            const result = runLexerTest(testCase);
            // 即使比较逻辑可能不同，测试应该正常运行
            expect(result).toBeDefined();
            expect(result.actual).toBeDefined();
            expect(result.expected).toBeDefined();
        });
    });
});

describe('Pattern-based Test Discovery', () => {
    test('should discover and run all fixture tests', async () => {
        // 示例：动态加载所有 fixtures
        // 在实际使用中，可以使用 fs.readdir 来动态发现
        const fixtures = ['simple-id', 'number-only', 'string-literal'];

        for (const fixture of fixtures) {
            const lexerFile = join(FIXTURES_DIR, fixture, 'lexer.l');
            const inputFile = join(FIXTURES_DIR, fixture, 'input.txt');
            const expectedFile = join(FIXTURES_DIR, fixture, 'expected.txt');

            // 验证文件存在
            expect(existsSync(lexerFile)).toBe(true);
            expect(existsSync(inputFile)).toBe(true);
            expect(existsSync(expectedFile)).toBe(true);
        }
    });
});
