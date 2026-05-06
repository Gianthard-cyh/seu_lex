// src/reparser/index.ts
import { RegexLexer } from './lexer.js';
import { RegexParser } from './parser.js';
import { buildFromAST } from './builder.js';
import type { NFA } from '../types.js';

export function parse(pattern: string): NFA {
    const lexer = new RegexLexer(pattern);
    const parser = new RegexParser(lexer);
    const ast = parser.parse();
    return buildFromAST(ast);
}

// 导出内部模块用于测试
export { RegexLexer } from './lexer.js';
export { RegexParser } from './parser.js';
export { buildFromAST } from './builder.js';
