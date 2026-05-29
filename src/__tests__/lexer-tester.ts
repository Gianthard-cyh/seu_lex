// src/__tests__/lexer-tester.ts
// 通用 Lexer 测试工具模块

import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { load } from '../loader/index.js';
import { parse } from '../reparser/index.js';
import { merge } from '../merger/index.js';
import { simplify } from '../simplifier/index.js';
import { generateToString } from '../generator/index.js';
import type { LexSpec, DFA } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

export interface LexerTestCase {
    /** 测试用例名称 */
    name: string;
    /** .l 文件路径 */
    lexerFile: string;
    /** 输入文件路径 */
    inputFile: string;
    /** 预期输出文件路径 */
    expectedFile: string;
    /** 可选：测试描述 */
    description?: string;
    /** 可选：自定义比较函数 */
    compareFn?: (actual: string, expected: string) => boolean;
}

export interface LexerTestResult {
    /** 是否通过 */
    passed: boolean;
    /** 实际输出 */
    actual: string;
    /** 预期输出 */
    expected: string;
    /** 差异信息（如果失败） */
    diff?: string;
    /** 错误信息（如果有） */
    error?: string;
}

export interface CompileOptions {
    /** 是否包含 main 函数 */
    includeMain?: boolean;
    /** main 函数的自定义代码 */
    mainCode?: string;
    /** 额外的 C 编译选项 */
    cflags?: string[];
    /** 运行时头文件路径 */
    runtimePath?: string;
}

const DEFAULT_COMPILE_OPTIONS: CompileOptions = {
    includeMain: true,
    runtimePath: join(PROJECT_ROOT, 'runtime'),
    cflags: []
};

const DEFAULT_MAIN_CODE = `
int main(int argc, char **argv) {
    yyin = stdin;
    yyout = stdout;
    int token;
    while ((token = yylex()) != 0) {
        printf("TOKEN:%d:%s\\n", token, yytext);
    }
    return 0;
}
`;

/**
 * 从 .l 文件生成 lexer 的完整流程
 * @param lexerFilePath .l 文件路径
 * @returns 包含生成的 C 代码和 DFA 的对象
 */
export function generateLexerFromFile(lexerFilePath: string): {
    code: string;
    spec: LexSpec;
    dfa: DFA;
} {
    // 1. 加载 .l 文件
    const spec = load(lexerFilePath);

    // 2. 解析所有规则为正则 NFA
    const nfas = spec.rules.map(r => parse(r.pattern));

    // 3. 合并 NFA
    const merged = merge(nfas, spec.rules);

    // 4. 简化（子集构造 + 最小化）生成 DFA
    const dfa = simplify(merged);

    // 5. 生成 C 代码
    const code = generateToString(dfa, spec);

    return { code, spec, dfa };
}

/**
 * 编译生成的 lexer 代码为可执行文件
 * @param code 生成的 C 代码
 * @param outputPath 输出可执行文件路径
 * @param options 编译选项
 */
export function compileLexer(
    code: string,
    outputPath: string,
    options: CompileOptions = {}
): void {
    const opts = { ...DEFAULT_COMPILE_OPTIONS, ...options };

    // 创建临时目录存放源文件
    const tempDir = mkdtempSync(join(tmpdir(), 'seulex-compile-'));
    const sourceFile = join(tempDir, 'lex.yy.c');

    try {
        // 添加 main 函数（如果需要）
        let fullCode = code;
        if (opts.includeMain) {
            const mainCode = opts.mainCode || DEFAULT_MAIN_CODE;
            // 检查是否已经包含 main 函数
            if (!fullCode.includes('int main(')) {
                fullCode += '\n' + mainCode;
            }
        }

        // 写入源文件
        writeFileSync(sourceFile, fullCode);

        // 编译
        const cflags = [
            `-I${opts.runtimePath}`,
            ...(opts.cflags || [])
        ].join(' ');

        const cmd = `gcc -o ${outputPath} ${sourceFile} ${cflags}`;
        execSync(cmd, { stdio: 'pipe' });
    } finally {
        // 清理临时目录
        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    }
}

/**
 * 运行编译后的 lexer
 * @param lexerPath 可执行文件路径
 * @param input 输入内容（字符串或文件路径）
 * @param isFilePath 如果为 true，input 被视为文件路径
 * @returns lexer 的输出
 */
export function runLexer(
    lexerPath: string,
    input: string,
    isFilePath: boolean = false
): string {
    if (!existsSync(lexerPath)) {
        throw new Error(`Lexer executable not found: ${lexerPath}`);
    }

    let cmd: string;
    if (isFilePath) {
        if (!existsSync(input)) {
            throw new Error(`Input file not found: ${input}`);
        }
        cmd = `${lexerPath} < ${input}`;
    } else {
        // 通过 echo 传递输入（注意转义）
        cmd = `printf '%s' '${input.replace(/'/g, "'\"'\"'")}' | ${lexerPath}`;
    }

    return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
}

/**
 * 对比实际输出和预期输出
 * @param actual 实际输出
 * @param expected 预期输出
 * @returns 是否匹配
 */
export function compareOutput(actual: string, expected: string): boolean {
    // 标准化行尾（统一为 \n）
    const normalizedActual = actual.replace(/\r\n/g, '\n').trim();
    const normalizedExpected = expected.replace(/\r\n/g, '\n').trim();
    return normalizedActual === normalizedExpected;
}

/**
 * 生成差异信息
 * @param actual 实际输出
 * @param expected 预期输出
 * @returns 差异描述
 */
export function generateDiff(actual: string, expected: string): string {
    const actualLines = actual.trim().split('\n');
    const expectedLines = expected.trim().split('\n');

    const maxLines = Math.max(actualLines.length, expectedLines.length);
    const diff: string[] = [];

    for (let i = 0; i < maxLines; i++) {
        const a = actualLines[i] || '(no line)';
        const e = expectedLines[i] || '(no line)';
        if (a !== e) {
            diff.push(`Line ${i + 1}:`);
            diff.push(`  Expected: ${e}`);
            diff.push(`  Actual:   ${a}`);
        }
    }

    return diff.join('\n');
}

/**
 * 执行单个测试用例
 * @param testCase 测试用例
 * @returns 测试结果
 */
export function runLexerTest(testCase: LexerTestCase): LexerTestResult {
    const tempDir = mkdtempSync(join(tmpdir(), 'seulex-test-'));
    const lexerPath = join(tempDir, 'lexer');

    try {
        // 1. 生成 lexer
        const { code } = generateLexerFromFile(testCase.lexerFile);

        // 2. 编译 lexer
        compileLexer(code, lexerPath);

        // 3. 运行 lexer
        const actual = runLexer(lexerPath, testCase.inputFile, true);

        // 4. 读取预期输出
        const expected = readFileSync(testCase.expectedFile, 'utf-8');

        // 5. 对比
        const compareFn = testCase.compareFn || compareOutput;
        const passed = compareFn(actual, expected);

        return {
            passed,
            actual,
            expected,
            diff: passed ? undefined : generateDiff(actual, expected)
        };
    } catch (error) {
        return {
            passed: false,
            actual: '',
            expected: readFileSync(testCase.expectedFile, 'utf-8'),
            error: error instanceof Error ? error.message : String(error)
        };
    } finally {
        // 清理
        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    }
}

/**
 * 从 fixtures 目录加载所有测试用例
 * @param fixturesDir fixtures 目录路径
 * @returns 测试用例数组
 */
export function loadTestCasesFromFixtures(fixturesDir: string): LexerTestCase[] {
    if (!existsSync(fixturesDir)) {
        throw new Error(`Fixtures directory not found: ${fixturesDir}`);
    }

    const testCases: LexerTestCase[] = [];

    // 遍历所有子目录
    const entries = readDirSync(fixturesDir);

    for (const entry of entries) {
        const testDir = join(fixturesDir, entry);
        const lexerFile = join(testDir, 'lexer.l');
        const inputFile = join(testDir, 'input.txt');
        const expectedFile = join(testDir, 'expected.txt');

        // 检查必需文件是否存在
        if (existsSync(lexerFile) && existsSync(inputFile) && existsSync(expectedFile)) {
            testCases.push({
                name: entry,
                lexerFile,
                inputFile,
                expectedFile
            });
        }
    }

    return testCases;
}

// 辅助函数：读取目录内容
function readDirSync(dir: string): string[] {
    const result: string[] = [];
    const items = readFileSync(dir, { encoding: 'utf-8' });
    // 使用 shell 命令列出目录
    try {
        const output = execSync(`ls -1 ${dir}`, { encoding: 'utf-8' });
        return output.trim().split('\n').filter(line => line.length > 0);
    } catch {
        return [];
    }
}

/**
 * 快速测试：(.l, input, expected) 三元组测试
 * 不生成可执行文件，直接在内存中测试
 * @param lexerFile .l 文件路径
 * @param input 输入字符串
 * @returns lexer 输出
 */
export function quickTestLexer(lexerFile: string, input: string): string {
    const tempDir = mkdtempSync(join(tmpdir(), 'seulex-quick-'));
    const lexerPath = join(tempDir, 'lexer');
    const inputFile = join(tempDir, 'input.txt');

    try {
        // 生成并编译
        const { code } = generateLexerFromFile(lexerFile);
        compileLexer(code, lexerPath);

        // 写入输入文件
        writeFileSync(inputFile, input);

        // 运行
        return runLexer(lexerPath, inputFile, true);
    } finally {
        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    }
}
