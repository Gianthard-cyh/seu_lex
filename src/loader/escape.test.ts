// Test for // pattern handling in loader
import { test, expect, describe } from 'vitest';
import { loadFromString } from './index.js';

describe('Loader escape handling', () => {
    test('should preserve // pattern without stripping', () => {
        const content = `%%
"//"[^\\n]*  { /* consume //-comment */ }
%%
`;
        const spec = loadFromString(content);
        expect(spec.rules).toHaveLength(1);
        // The pattern should be // followed by non-newline chars
        // The \\n in the pattern should become \\\\n (to match newline in regex)
        expect(spec.rules[0].pattern).toContain('/');
        // Check that pattern has backslash (92) followed by n (110), not literal newline (10)
        const pattern = spec.rules[0].pattern;
        expect(pattern.includes('\\n')).toBe(true);
        expect(pattern.includes('\n')).toBe(false);  // Should NOT have literal newline
    });

    test('should preserve /* pattern', () => {
        const content = `%%
"/*"  { comment(); }
%%
`;
        const spec = loadFromString(content);
        expect(spec.rules).toHaveLength(1);
        // /* should be escaped to \/\* for regex (literal /*)
        expect(spec.rules[0].pattern).toBe('\\/\\*');
    });

    test('should escape regex metacharacters in literal strings', () => {
        const content = `%%
"+="  { return(ADD_ASSIGN); }
%%
`;
        const spec = loadFromString(content);
        expect(spec.rules).toHaveLength(1);
        // += should be escaped to \+= for regex
        expect(spec.rules[0].pattern).toBe('\\+=');
    });

    test('should handle string literal pattern correctly', () => {
        const content = `%%
L?"(\\.|[^\\"\\n])*"  { return(STRING_LITERAL); }
%%
`;
        const spec = loadFromString(content);
        expect(spec.rules).toHaveLength(1);
        const pattern = spec.rules[0].pattern;
        // Should contain escaped quotes
        expect(pattern).toContain('"');
    });

    test('should preserve \\n as backslash-n in character class', () => {
        const content = `%%
"[^\\n]*"  { action; }
%%
`;
        const spec = loadFromString(content);
        expect(spec.rules).toHaveLength(1);
        const pattern = spec.rules[0].pattern;
        // The pattern should contain \\n (two chars: backslash + n) to match newline in regex
        // Not a literal newline character
        const hasBackslashN = pattern.includes('\\n');
        expect(hasBackslashN).toBe(true);
    });
});
