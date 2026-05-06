// src/generator/index.test.ts
import { describe, test, expect } from 'vitest';
import { generateToString, generateParts } from './index.js';
import { parse } from '../reparser/index.js';
import { simplify } from '../simplifier/index.js';
import type { LexSpec, DFA } from '../types.js';

describe('Generator', () => {
    test('生成包含必要宏定义的代码', () => {
        const nfa = parse('a');
        const dfa = simplify(nfa);
        const spec: LexSpec = {
            header: '#include <stdio.h>',
            definitions: [],
            rules: [{ pattern: 'a', action: 'return 1;', lineNo: 1, priority: 0 }],
            trailer: 'int main() { return 0; }'
        };

        const code = generateToString(dfa, spec);

        expect(code).toContain('YY_NUM_STATES');
        expect(code).toContain('YY_NUM_RULES');
        expect(code).toContain('yy_next');
        expect(code).toContain('yy_accept');
        expect(code).toContain('yylex');
    });

    test('生成的代码包含动作代码', () => {
        const nfa = parse('a');
        const dfa = simplify(nfa);
        const spec: LexSpec = {
            header: '',
            definitions: [],
            rules: [{ pattern: 'a', action: 'printf("A");', lineNo: 1, priority: 0 }],
            trailer: ''
        };

        const code = generateToString(dfa, spec);
        expect(code).toContain('printf("A")');
    });

    test('生成的代码结构正确', () => {
        const nfa = parse('a');
        const dfa = simplify(nfa);
        const spec: LexSpec = {
            header: '/* header */',
            definitions: [],
            rules: [{ pattern: 'a', action: 'return 1;', lineNo: 1, priority: 0 }],
            trailer: '/* trailer */'
        };

        const parts = generateParts(dfa, spec);
        expect(parts.header).toContain('/* header */');
        expect(parts.trailer).toContain('/* trailer */');
        expect(parts.transitionTable).toContain('yy_next');
        expect(parts.acceptTable).toContain('yy_accept');
    });
});
