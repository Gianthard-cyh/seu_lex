// src/reparser/parser.ts
import type { RegexAST, CharClass } from '../types.js';
import { RegexLexer, type RegexToken } from './lexer.js';
import { RegexParseError } from '../errors.js';

export class RegexParser {
    private lexer: RegexLexer;
    private current: RegexToken;

    constructor(lexer: RegexLexer) {
        this.lexer = lexer;
        this.current = lexer.nextToken();
    }

    parse(): RegexAST {
        const result = this.parseUnion();
        if (this.current.type !== 'EOF') {
            throw new RegexParseError('Unexpected token after expression', 0);
        }
        return result;
    }

    private advance(): void {
        this.current = this.lexer.nextToken();
    }

    // union = concat ( '|' concat )*
    private parseUnion(): RegexAST {
        let left = this.parseConcat();

        while (this.current.type === 'PIPE') {
            this.advance();
            const right = this.parseConcat();
            left = { type: 'union', left, right };
        }

        return left;
    }

    // concat = postfix ( postfix )*
    private parseConcat(): RegexAST {
        const terms: RegexAST[] = [];

        while (this.current.type !== 'EOF' &&
               this.current.type !== 'RPAREN' &&
               this.current.type !== 'RBRACE' &&
               this.current.type !== 'PIPE') {
            terms.push(this.parsePostfix());
        }

        if (terms.length === 0) {
            // 空表达式
            return { type: 'char', char: 0 };
        }

        // 左结合连接
        let result = terms[0];
        for (let i = 1; i < terms.length; i++) {
            result = { type: 'concat', left: result, right: terms[i] };
        }

        return result;
    }

    // postfix = primary ( '*' | '+' | '?' | '{' num ',' num? '}' )?
    private parsePostfix(): RegexAST {
        const primary = this.parsePrimary();

        switch (this.current.type) {
            case 'STAR':
                this.advance();
                return { type: 'star', child: primary };

            case 'PLUS':
                this.advance();
                return { type: 'plus', child: primary };

            case 'QUESTION':
                this.advance();
                return { type: 'optional', child: primary };

            case 'LBRACE':
                return this.parseRange(primary);

            default:
                return primary;
        }
    }

    // '{' num ',' num? '}'
    private parseRange(child: RegexAST): RegexAST {
        this.advance(); // 消耗 '{'

        // 解析最小值
        if (this.current.type !== 'CHAR') {
            throw new RegexParseError('Expected number in range', 0);
        }

        const minStr = String.fromCharCode((this.current as { type: 'CHAR'; value: number }).value);
        if (!/^\d+$/.test(minStr)) {
            throw new RegexParseError('Expected number in range', 0);
        }
        const min = parseInt(minStr, 10);

        // 消耗最小值，获取下一个 token
        this.advance();

        let max: number | null = null;

        // 保存当前 token 类型
        const tokenType = (this.current as RegexToken).type;

        if (tokenType === 'COMMA') {
            this.advance();
            // 可能有最大值
            const nextType = (this.current as RegexToken).type;
            if (nextType === 'CHAR') {
                const maxStr = String.fromCharCode((this.current as { type: 'CHAR'; value: number }).value);
                if (/^\d+$/.test(maxStr)) {
                    max = parseInt(maxStr, 10);
                    this.advance();
                }
            }
            // 如果没有最大值，则是 {m,} 形式
        } else if (tokenType !== 'RBRACE') {
            throw new RegexParseError('Expected , or } in range', 0);
        }

        const finalTokenType = (this.current as RegexToken).type;
        if (finalTokenType !== 'RBRACE') {
            throw new RegexParseError('Expected } to close range', 0);
        }
        this.advance();

        if (max !== null && min > max) {
            throw new RegexParseError('Invalid range: min > max', 0);
        }

        return { type: 'range', child, min, max };
    }

    // primary = char | class | '.' | '(' union ')'
    private parsePrimary(): RegexAST {
        switch (this.current.type) {
            case 'CHAR':
                const char = this.current.value;
                this.advance();
                return { type: 'char', char };

            case 'COMMA':
                // Comma as literal character (ASCII 44)
                this.advance();
                return { type: 'char', char: 44 };

            case 'CLASS':
                const cls = this.current.value;
                this.advance();
                return { type: 'class', class: cls };

            case 'DOT':
                this.advance();
                return { type: 'any' };

            case 'LPAREN': {
                this.advance();
                const expr = this.parseUnion();
                // 使用类型断言避免类型收窄问题
                const closeToken = this.current as RegexToken;
                if (closeToken.type !== 'RPAREN') {
                    throw new RegexParseError('Expected )', 0);
                }
                this.advance();
                return expr;
            }

            default:
                throw new RegexParseError(`Unexpected token: ${this.current.type}`, 0);
        }
    }
}
