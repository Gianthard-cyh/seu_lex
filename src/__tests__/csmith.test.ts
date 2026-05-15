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
    seulexLexer: string;
}

describe('CSmith E2E Tests', () => {
    const ctx: TestContext = {
        tempDir: '',
        hasCsmith: false,
        seulexLexer: ''
    };

    beforeAll(() => {
        ctx.hasCsmith = checkCommand(CSMITH_CMD);
        console.log(`CSmith available: ${ctx.hasCsmith}`);

        if (!ctx.hasCsmith) {
            console.log('Install csmith: sudo pacman -S csmith 或 sudo apt-get install csmith');
            return;
        }

        ctx.tempDir = mkdtempSync(join(tmpdir(), 'seulex-csmith-'));

        // 生成 SeuLex 词法分析器（使用原始 spec，不修改 action）
        const spec = load(join(PROJECT_ROOT, 'c99.l'));
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        let code = generateToString(dfa, spec);

        // 添加简单的 main 函数
        code += `
/* ===== Test Main ===== */
int main(int argc, char **argv) {
    yyin = stdin;
    yyout = stdout;  /* 初始化 yyout，避免 ECHO 崩溃 */
    int token;
    int count = 0;
    while ((token = yylex()) != 0) {
        count++;
    }
    printf("Processed %d tokens\\n", count);
    return 0;
}
`;

        const seulexC = join(ctx.tempDir, 'seulex_lex.yy.c');
        writeFileSync(seulexC, code);

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
        }
    });

    test('CSmith should be available', () => {
        expect(ctx.hasCsmith).toBe(true);
    });

    for (let i = 0; i < TEST_COUNT; i++) {
        test(`CSmith random program #${i + 1}`, () => {
            if (!ctx.hasCsmith || !ctx.seulexLexer) {
                return;
            }

            const testC = join(ctx.tempDir, `test_${i}.c`);
            const seulexOut = join(ctx.tempDir, `test_${i}_seulex.txt`);

            // 生成随机 C 程序（限制大小以避免缓冲区问题）
            try {
                execSync(`${CSMITH_CMD} -o ${testC} --no-packed-struct --max-block-size 50`, { stdio: 'pipe' });
            } catch (e) {
                console.error('CSmith generation failed:', e);
                throw e;
            }

            // SeuLex 处理
            const result = execSync(`${ctx.seulexLexer} < ${testC} 2>&1`, { encoding: 'utf-8' });
            writeFileSync(seulexOut, result);

            // 验证：
            // 1. 无错误输出
            expect(result).not.toContain('Error: unexpected character');
            // 2. 成功处理了 token（有输出或正常结束）
            expect(result).toContain('Processed');
            // 3. 处理了一些 token
            const match = result.match(/Processed (\d+) tokens/);
            if (match) {
                const tokenCount = parseInt(match[1], 10);
                expect(tokenCount).toBeGreaterThan(0);
            }
        });
    }

    afterAll(() => {
        if (ctx.tempDir && existsSync(ctx.tempDir)) {
            rmSync(ctx.tempDir, { recursive: true, force: true });
        }
    });
});
