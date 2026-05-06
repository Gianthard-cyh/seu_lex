// src/loader/index.test.ts
import { describe, test, expect } from 'vitest';
import { loadFromString, expandMacros } from './index.js';
import { LexerSpecError } from '../errors.js';

describe('SourceLoader', () => {
    test('解析最简单的 .l 文件', () => {
        const input = `%%
a { return 1; }
%%`;
        const spec = loadFromString(input);
        expect(spec.header).toBe('');
        expect(spec.definitions).toEqual([]);
        expect(spec.rules).toHaveLength(1);
        expect(spec.rules[0].pattern).toBe('a');
        expect(spec.rules[0].action).toBe('return 1;');
        expect(spec.rules[0].priority).toBe(0);
        expect(spec.trailer).toBe('');
    });

    test('解析包含 header 的文件', () => {
        const input = `%{
#include <stdio.h>
%}
%%
a { return 1; }
%%`;
        const spec = loadFromString(input);
        expect(spec.header).toBe('#include <stdio.h>');
    });

    test('解析包含 trailer 的文件', () => {
        const input = `%%
a { return 1; }
%%
int main() { return 0; }`;
        const spec = loadFromString(input);
        expect(spec.trailer).toBe('int main() { return 0; }');
    });

    test('解析多个规则', () => {
        const input = `%%
a { return 1; }
b { return 2; }
c { return 3; }
%%`;
        const spec = loadFromString(input);
        expect(spec.rules).toHaveLength(3);
        expect(spec.rules[0].priority).toBe(0);
        expect(spec.rules[1].priority).toBe(1);
        expect(spec.rules[2].priority).toBe(2);
    });

    test('缺少 %% 分隔符', () => {
        const input = `a { return 1; }`;
        expect(() => loadFromString(input)).toThrow(LexerSpecError);
    });

    test('只有一段 %%', () => {
        const input = `%%
a { return 1; }`;
        expect(() => loadFromString(input)).toThrow(LexerSpecError);
    });
});

describe('宏定义展开', () => {
    test('展开简单宏', () => {
        const input = `DIGIT [0-9]
%%
{DIGIT}+ { return 1; }
%%`;
        const spec = loadFromString(input);
        expect(spec.definitions).toHaveLength(1);
        expect(spec.definitions[0].name).toBe('DIGIT');
        expect(spec.definitions[0].definition).toBe('[0-9]');
        expect(spec.rules[0].pattern).toBe('[0-9]+');
    });

    test('展开多个宏', () => {
        const input = `DIGIT [0-9]
LETTER [a-z]
%%
{DIGIT}|{LETTER} { return 1; }
%%`;
        const spec = loadFromString(input);
        expect(spec.rules[0].pattern).toBe('[0-9]|[a-z]');
    });

    test('展开嵌套宏', () => {
        const input = `DIGIT [0-9]
NUMBER {DIGIT}+
%%
{NUMBER} { return 1; }
%%`;
        const spec = loadFromString(input);
        expect(spec.rules[0].pattern).toBe('[0-9]+');
    });
});

describe('expandMacros', () => {
    test('直接展开宏', () => {
        const definitions = [
            { name: 'DIGIT', definition: '[0-9]' },
            { name: 'LETTER', definition: '[a-zA-Z]' }
        ];

        expect(expandMacros('{DIGIT}', definitions)).toBe('[0-9]');
        expect(expandMacros('{DIGIT}+', definitions)).toBe('[0-9]+');
        expect(expandMacros('{DIGIT}|{LETTER}', definitions)).toBe('[0-9]|[a-zA-Z]');
    });

    test('未定义的宏保持原样', () => {
        const definitions: { name: string; definition: string }[] = [];
        expect(expandMacros('{UNDEFINED}', definitions)).toBe('{UNDEFINED}');
    });
});
