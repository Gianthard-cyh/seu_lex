// src/__tests__/csmith.test.ts
// CSmith 端到端测试 - 使用随机生成的 C 程序验证词法分析器
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'fs';
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
        console.log(`CSmith available: ${ctx.hasCsmith}`);
        console.log(`Flex available: ${ctx.hasFlex}`);

        if (!ctx.hasCsmith) {
            console.log('Install csmith: sudo pacman -S csmith');
            return;
        }

        ctx.tempDir = mkdtempSync(join(tmpdir(), 'seulex-csmith-'));

        // 生成 SeuLex 词法分析器
        const spec = load(join(PROJECT_ROOT, 'c99.l'));
        const nfas = spec.rules.map(r => parse(r.pattern));
        const merged = merge(nfas, spec.rules);
        const dfa = simplify(merged);
        let code = generateToString(dfa, spec);

        code += `
int main(int argc, char **argv) {
    yyin = stdin;
    yyout = stdout;
    int token;
    int count = 0;
    while ((token = yylex()) != 0) {
        fprintf(stderr, "TOKEN:%d:%s\\n", token, yytext);
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
            return;
        }

        // 生成 Flex 词法分析器（使用项目中的 c99.l）
        if (ctx.hasFlex) {
            try {
                const flexC = join(ctx.tempDir, 'lex.yy.c');
                execSync(`flex -o ${flexC} ${join(PROJECT_ROOT, 'c99.l')}`, { stdio: 'pipe' });

                // 添加 main 函数到 Flex 生成的代码
                const mainCode = `
int main(int argc, char **argv) {
    yyin = stdin;
    yyout = stdout;
    int token;
    int count = 0;
    while ((token = yylex()) != 0) {
        fprintf(stderr, "TOKEN:%d:%s\\n", token, yytext);
        count++;
    }
    printf("Processed %d tokens\\n", count);
    return 0;
}
`;
                const flexCode = execSync(`cat ${flexC}`, { encoding: 'utf-8' });
                writeFileSync(flexC, flexCode + mainCode);

                ctx.flexLexer = join(ctx.tempDir, 'flex_lexer');
                execSync(
                    `gcc -o ${ctx.flexLexer} ${flexC} ` +
                    `-I${PROJECT_ROOT} -I${join(PROJECT_ROOT, 'runtime')} -lfl 2>&1 || ` +
                    `gcc -o ${ctx.flexLexer} ${flexC} ` +
                    `-I${PROJECT_ROOT} -I${join(PROJECT_ROOT, 'runtime')}`,
                    { stdio: 'pipe' }
                );
                console.log('Flex lexer compiled successfully');
            } catch (e) {
                console.log('Flex compilation failed:', e);
                ctx.hasFlex = false;
            }
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
            const flexOut = join(ctx.tempDir, `test_${i}_flex.txt`);

            // 生成小型随机 C 程序
            try {
                execSync(
                    `${CSMITH_CMD} -o ${testC} --no-packed-struct ` +
                    `--max-funcs 1 --max-block-size 2 --max-block-depth 2 ` +
                    `--max-array-dim 1 --max-struct-fields 2 --max-array-len-per-dim 2 ` +
                    `--concise`,
                    { stdio: 'pipe', timeout: 5000 }
                );
            } catch (e) {
                console.error('CSmith generation failed:', e);
                throw e;
            }

            // SeuLex 处理
            const seulexResult = execSync(`${ctx.seulexLexer} < ${testC} 2>&1`, { encoding: 'utf-8' });
            writeFileSync(seulexOut, seulexResult);

            // 验证 SeuLex
            expect(seulexResult).not.toContain('Error: unexpected character');
            expect(seulexResult).toContain('Processed');

            const seulexMatch = seulexResult.match(/Processed (\d+) tokens/);
            if (seulexMatch) {
                expect(parseInt(seulexMatch[1], 10)).toBeGreaterThan(0);
            }

            // Flex 对比 - token 数量必须严格匹配
            if (ctx.hasFlex && ctx.flexLexer) {
                try {
                    const flexResult = execSync(`${ctx.flexLexer} < ${testC} 2>&1`, { encoding: 'utf-8' });
                    writeFileSync(flexOut, flexResult);

                    // 提取 token 数量
                    const seulexMatch = seulexResult.match(/Processed (\d+) tokens/);
                    const seulexTokens = seulexMatch ? parseInt(seulexMatch[1], 10) : 0;
                    const flexMatch = flexResult.match(/Processed (\d+) tokens/);
                    const flexTokens = flexMatch ? parseInt(flexMatch[1], 10) : 0;

                    // 解析 TOKEN:id:text 格式
                    interface TokenInfo {
                        id: number;
                        text: string;
                    }

                    const parseTokens = (output: string): TokenInfo[] => {
                        return output.split('\n')
                            .filter(l => l.startsWith('TOKEN:'))
                            .map(l => {
                                const parts = l.split(':');
                                return {
                                    id: parseInt(parts[1], 10),
                                    text: parts.slice(2).join(':') || ''
                                };
                            });
                    };

                    const seulexTokenList = parseTokens(seulexResult);
                    const flexTokenList = parseTokens(flexResult);

                    // 如果数量不匹配或内容不匹配，输出详细对比
                    if (seulexTokenList.length !== flexTokenList.length ||
                        seulexTokenList.some((t, i) => flexTokenList[i] && t.id !== flexTokenList[i].id)) {
                        console.log(`\n=== Token mismatch for test ${i} ===`);
                        console.log(`SeuLex tokens: ${seulexTokenList.length}, Flex tokens: ${flexTokenList.length}`);
                        console.log('\nFirst 20 tokens comparison:');
                        console.log('Index | SeuLex ID | SeuLex Text      | Flex ID | Flex Text');
                        console.log('------|-----------|------------------|---------|------------------');
                        const maxShow = Math.min(20, Math.max(seulexTokenList.length, flexTokenList.length));
                        for (let j = 0; j < maxShow; j++) {
                            const st = seulexTokenList[j];
                            const ft = flexTokenList[j];
                            const marker = (!st || !ft || st.id !== ft.id) ? '<<<' : '   ';
                            console.log(`${marker} ${j.toString().padStart(3)} | ${(st?.id ?? 'N/A').toString().padStart(9)} | ${(st?.text ?? 'N/A').padEnd(16)} | ${(ft?.id ?? 'N/A').toString().padStart(7)} | ${(ft?.text ?? 'N/A').padEnd(16)}`);
                        }
                    }

                    // token 数量和 ID 必须完全一致
                    expect(seulexTokenList.length).toBe(flexTokenList.length);
                    for (let j = 0; j < seulexTokenList.length; j++) {
                        expect(seulexTokenList[j].id).toBe(flexTokenList[j].id);
                    }
                } catch (e) {
                    console.log(`Flex failed for test ${i}:`, e);
                    throw e;
                }
            }
        });
    }

    afterAll(() => {
        if (ctx.tempDir && existsSync(ctx.tempDir)) {
            rmSync(ctx.tempDir, { recursive: true, force: true });
        }
    });
});
