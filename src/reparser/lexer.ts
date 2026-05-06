// src/reparser/lexer.ts
import type { CharClass } from '../types.js';
import { RegexParseError } from '../errors.js';

export type RegexToken =
    | { type: 'CHAR'; value: number }
    | { type: 'ESCAPED'; value: number }
    | { type: 'CLASS'; value: CharClass }
    | { type: 'DOT' }
    | { type: 'STAR' }
    | { type: 'PLUS' }
    | { type: 'QUESTION' }
    | { type: 'PIPE' }
    | { type: 'LPAREN' }
    | { type: 'RPAREN' }
    | { type: 'LBRACE' }
    | { type: 'RBRACE' }
    | { type: 'COMMA' }
    | { type: 'EOF' };

export class RegexLexer {
    private input: string;
    private pos: number = 0;

    constructor(input: string) {
        this.input = input;
    }

    nextToken(): RegexToken {
        if (this.pos >= this.input.length) {
            return { type: 'EOF' };
        }

        const char = this.input[this.pos];
        this.pos++;

        switch (char) {
            case '*': return { type: 'STAR' };
            case '+': return { type: 'PLUS' };
            case '?': return { type: 'QUESTION' };
            case '|': return { type: 'PIPE' };
            case '(':
                // 检查是否是 {n,m} 语法的开始
                if (this.peekChar() === '{') {
                    this.pos++;
                    return { type: 'LBRACE' };
                }
                return { type: 'LPAREN' };
            case ')': return { type: 'RPAREN' };
            case '{': return { type: 'LBRACE' };
            case '}': return { type: 'RBRACE' };
            case ',': return { type: 'COMMA' };
            case '.': return { type: 'DOT' };
            case '[':
                return this.parseCharClass();
            case '\\':
                return this.parseEscape();
            default:
                return { type: 'CHAR', value: char.charCodeAt(0) };
        }
    }

    peek(): RegexToken {
        const savedPos = this.pos;
        const token = this.nextToken();
        this.pos = savedPos;
        return token;
    }

    private peekChar(): string {
        if (this.pos >= this.input.length) return '';
        return this.input[this.pos];
    }

    private parseCharClass(): RegexToken {
        let negated = false;

        if (this.peekChar() === '^') {
            negated = true;
            this.pos++;
        }

        const ranges: [number, number][] = [];
        const singles: number[] = [];
        let closed = false;

        while (this.pos < this.input.length) {
            const char = this.input[this.pos];

            if (char === ']') {
                this.pos++;
                closed = true;
                break;
            }

            if (char === '\\') {
                this.pos++;
                if (this.pos >= this.input.length) {
                    throw new RegexParseError('Unterminated character class', this.pos);
                }
                const escaped = this.input[this.pos];
                const escapedChar = this.parseEscapeChar(escaped);

                // 检查是否是范围 a-b
                if (this.peekChar() === '-' && this.input[this.pos + 1] !== ']') {
                    this.pos++;
                    const endChar = this.input[this.pos];
                    let endCode: number;
                    if (endChar === '\\') {
                        this.pos++;
                        endCode = this.parseEscapeChar(this.input[this.pos]);
                    } else {
                        endCode = endChar.charCodeAt(0);
                    }
                    this.pos++;
                    ranges.push([escapedChar, endCode]);
                } else {
                    singles.push(escapedChar);
                    this.pos++;
                }
                continue;
            }

            const charCode = char.charCodeAt(0);
            this.pos++;

            // 检查是否是范围 a-b
            if (this.peekChar() === '-' && this.input[this.pos + 1] !== ']') {
                this.pos++; // 跳过 '-'
                const endChar = this.input[this.pos];
                let endCode: number;
                if (endChar === '\\') {
                    this.pos++;
                    endCode = this.parseEscapeChar(this.input[this.pos]);
                    this.pos++;
                } else {
                    endCode = endChar.charCodeAt(0);
                    this.pos++;
                }
                ranges.push([charCode, endCode]);
            } else {
                singles.push(charCode);
            }
        }

        // 如果没有遇到 ]，说明字符类未闭合
        if (!closed) {
            throw new RegexParseError('Unterminated character class', this.pos);
        }

        if (singles.length === 0 && ranges.length === 0) {
            throw new RegexParseError('Empty character class', this.pos);
        }

        const charClass: CharClass = { negated, ranges, singles };
        return { type: 'CLASS', value: charClass };
    }

    private parseEscape(): RegexToken {
        if (this.pos >= this.input.length) {
            throw new RegexParseError('Unexpected end of input after \\', this.pos);
        }

        const char = this.input[this.pos];
        this.pos++;

        const code = this.parseEscapeChar(char);
        return { type: 'CHAR', value: code };
    }

    private parseEscapeChar(char: string): number {
        switch (char) {
            case 'n': return '\n'.charCodeAt(0);
            case 't': return '\t'.charCodeAt(0);
            case 'r': return '\r'.charCodeAt(0);
            case 'f': return '\f'.charCodeAt(0);
            case 'v': return '\v'.charCodeAt(0);
            case '0': return 0;
            case 'x':
                // \xNN 十六进制
                if (this.pos + 1 < this.input.length) {
                    const hex = this.input.slice(this.pos, this.pos + 2);
                    this.pos += 2;
                    return parseInt(hex, 16);
                }
                throw new RegexParseError('Invalid hex escape', this.pos);
            default:
                // 字面量字符
                return char.charCodeAt(0);
        }
    }
}
