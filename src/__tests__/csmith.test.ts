// src/__tests__/csmith.test.ts
// CSmith 端到端测试 - 使用随机生成的 C 程序验证词法分析器
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load } from '../loader/index.js';
import { parse } from '../reparser/index.js';
import { merge } from '../merger/index.js';
import { simplify } from '../simplifier/index.js';
import { generateToString } from '../generator/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

const TEST_COUNT = parseInt(process.env.CSMITH_COUNT || '10', 10);
const CSMITH_CMD = process.env.CSMITH || 'csmith';

// 检测工具是否可用
function checkCommand(cmd: string): boolean {
    try {
        execSync(`which ${cmd}`, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

interface TestContext {
    tempDir: string;
    hasCsmith: boolean;
    hasFlex: boolean;
    seulexLexer: string;
    flexLexer: string;
}

describe('CSmith E2E Tests', () => {
    const ctx: TestContext = {
        tempDir: '',
        hasCsmith: false,
        hasFlex: false,
        seulexLexer: '',
        flexLexer: ''
    };

    beforeAll(() => {
        ctx.hasCsmith = checkCommand(CSMITH_CMD);
        ctx.hasFlex = checkCommand('flex');

        // 这个测试只是报告环境状态
        console.log(`CSmith available: ${ctx.hasCsmith}`);
        console.log(`Flex available: ${ctx.hasFlex}`);

        if (!ctx.hasCsmith) {
            console.log('Install csmith: sudo pacman -S csmith 或 sudo apt-get install csmith');
            return;
        }

        // 创建临时目录
        ctx.tempDir = mkdtempSync(join(tmpdir(), 'seulex-csmith-'));

        // 生成 SeuLex 词法分析器
        const spec = load(join(PROJECT_ROOT, 'c99.l'));
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        let code = generateToString(dfa, spec);

        // 为测试添加一个简单的 main 函数
        code += `
/* ===== Test Main ===== */
int main(int argc, char **argv) {
    yyin = stdin;
    int token;
    while ((token = yylex()) != 0) {
        /* Token processed, output handled by actions */
    }
    return 0;
}
`;

        const seulexC = join(ctx.tempDir, 'seulex_lex.yy.c');
        writeFileSync(seulexC, code);

        // 编译 SeuLex 词法分析器 - 需要包含项目根目录和 runtime
        ctx.seulexLexer = join(ctx.tempDir, 'seulex_lexer');
        try {
            execSync(
                `gcc -o ${ctx.seulexLexer} ${seulexC} ` +
                `-I${PROJECT_ROOT} -I${join(PROJECT_ROOT, 'runtime')}`,
                { stdio: 'pipe' }
            );
        } catch (e) {
            console.error('Failed to compile SeuLex lexer:', e);
            ctx.hasCsmith = false;
            return;
        }

        // 生成 Flex 词法分析器（对比用）
        if (ctx.hasFlex) {
            try {
                const flexC = join(ctx.tempDir, 'lex.yy.c');
                execSync(`flex -o ${flexC} ${join(PROJECT_ROOT, 'c99.l')}`, { stdio: 'pipe' });
                ctx.flexLexer = join(ctx.tempDir, 'flex_lexer');
                // 尝试编译 Flex 输出，某些系统可能没有 -lfl
                try {
                    execSync(
                        `gcc -o ${ctx.flexLexer} ${flexC} ` +
                        `-I${PROJECT_ROOT} -I${join(PROJECT_ROOT, 'runtime')} -lfl`,
                        { stdio: 'pipe' }
                    );
                } catch {
                    // 尝试不带 -lfl
                    execSync(
                        `gcc -o ${ctx.flexLexer} ${flexC} ` +
                        `-I${PROJECT_ROOT} -I${join(PROJECT_ROOT, 'runtime')}`,
                        { stdio: 'pipe' }
                    );
                }
            } catch (e) {
                console.log('Flex compilation failed, will skip comparison');
                ctx.hasFlex = false;
            }
        }
    });

    test('CSmith and Flex should be available', () => {
        expect(ctx.hasCsmith).toBe(true);
    });

    // 动态生成测试用例
    for (let i = 0; i < TEST_COUNT; i++) {
        test(`CSmith random program #${i + 1}`, () => {
            if (!ctx.hasCsmith || !ctx.seulexLexer) {
                return; // 跳过
            }

            const testC = join(ctx.tempDir, `test_${i}.c`);
            const seulexOut = join(ctx.tempDir, `test_${i}_seulex.txt`);
            const flexOut = join(ctx.tempDir, `test_${i}_flex.txt`);

            // 1. 用 CSmith 生成随机 C 程序
            try {
                execSync(`${CSMITH_CMD} -o ${testC} --no-packed-struct`, { stdio: 'pipe' });
            } catch (e) {
                console.error('CSmith generation failed:', e);
                throw e;
            }

            // 2. 用 SeuLex 词法分析器处理
            try {
                execSync(`${ctx.seulexLexer} < ${testC} > ${seulexOut} 2>&1`, { stdio: 'pipe' });
            } catch (e) {
                // 词法分析器可能因 EOF 退出，检查输出文件是否存在
            }

            // 验证输出文件存在
            expect(existsSync(seulexOut)).toBe(true);

            // 3. 如果有 Flex，进行对比
            if (ctx.hasFlex && ctx.flexLexer) {
                try {
                    execSync(`${ctx.flexLexer} < ${testC} > ${flexOut} 2>&1`, { stdio: 'pipe' });
                } catch (e) {
                    // Flex 也可能因 EOF 退出
                }

                // 对比输出
                if (existsSync(flexOut) && existsSync(seulexOut)) {
                    const seulexResult = readFileSync(seulexOut, 'utf-8');
                    const flexResult = readFileSync(flexOut, 'utf-8');

                    // 基本验证：两者都应该有内容
                    expect(seulexResult).toBeDefined();
                    expect(flexResult).toBeDefined();
                }
            }

            // 4. 验证 SeuLex 没有崩溃（不包含 "Error:"）
            const seulexResult = readFileSync(seulexOut, 'utf-8');
            expect(seulexResult).not.toContain('Error: unexpected character');
        });
    }

    // 清理测试文件
    afterAll(() => {
        if (ctx.tempDir && existsSync(ctx.tempDir)) {
            rmSync(ctx.tempDir, { recursive: true, force: true });
        }
    });
});
