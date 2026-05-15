// src/loader/index.ts
import { readFileSync } from 'fs';
import type { LexSpec, Definition, Rule } from '../types.js';
import { LexerSpecError } from '../errors.js';

export function load(filename: string): LexSpec {
    const content = readFileSync(filename, 'utf-8');
    return loadFromString(content, filename);
}

export function loadFromString(content: string, filename?: string): LexSpec {
    // Normalize line endings: remove \r from Windows-style line endings
    const normalized = content.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');

    // 找到 %% 分隔符的位置
    const separatorIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === '%%') {
            separatorIndices.push(i);
        }
    }

    if (separatorIndices.length < 2) {
        throw new LexerSpecError(
            'Invalid .l file format: need at least two %% separators',
            separatorIndices.length === 0 ? 1 : separatorIndices[0] + 1
        );
    }

    const firstSep = separatorIndices[0];
    const secondSep = separatorIndices[1];

    // 解析定义段 (0 到 firstSep)
    const definitionLines = lines.slice(0, firstSep);
    const { header, definitions } = parseDefinitions(definitionLines);

    // 解析规则段 (firstSep+1 到 secondSep)
    const ruleLines = lines.slice(firstSep + 1, secondSep);
    const rules = parseRules(ruleLines);

    // 解析用户代码段 (secondSep+1 到末尾)
    const trailer = lines.slice(secondSep + 1).join('\n');

    // 展开宏定义
    const expandedRules = rules.map(rule => ({
        ...rule,
        pattern: expandMacros(rule.pattern, definitions)
    }));

    return {
        header,
        definitions,
        rules: expandedRules,
        trailer
    };
}

function parseDefinitions(lines: string[]): { header: string; definitions: Definition[] } {
    let header = '';
    const definitions: Definition[] = [];

    let inHeader = false;
    let headerBuffer: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('%{')) {
            inHeader = true;
            continue;
        }

        if (trimmed.startsWith('%}')) {
            inHeader = false;
            header = headerBuffer.join('\n');
            headerBuffer = [];
            continue;
        }

        if (inHeader) {
            headerBuffer.push(line);
            continue;
        }

        // 解析宏定义: NAME definition
        const match = trimmed.match(/^(\w+)\s+(.+)$/);
        if (match) {
            // Strip C-style comments from definition
            let def = match[2].replace(/\/\*.*?\*\//g, '').trim();
            // Strip C++ style comments too
            def = def.replace(/\/\/.*$/, '').trim();
            definitions.push({
                name: match[1],
                definition: def
            });
        }
    }

    return { header, definitions };
}

function parseRules(lines: string[]): Rule[] {
    const rules: Rule[] = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Skip pure comment lines
        line = line.trim();
        if (line === '' || line.startsWith('/*') || line.startsWith('//')) {
            continue;
        }

        // Find the action: the last { ... } at the end of the line
        // Pattern: everything before the action, Action: content inside { }
        let pattern: string | null = null;
        let action: string | null = null;

        // Find last opening brace that has a matching closing brace at end
        // Need to handle quotes to avoid counting } inside strings like ("}"|"<%")
        let braceDepth = 0;
        let lastOpenBrace = -1;
        let matchingCloseBrace = -1;
        let inQuote = false;
        let quoteChar = '';

        for (let j = line.length - 1; j >= 0; j--) {
            const char = line[j];

            // Handle quotes
            if (char === '"' || char === "'") {
                if (!inQuote) {
                    inQuote = true;
                    quoteChar = char;
                } else if (quoteChar === char) {
                    inQuote = false;
                    quoteChar = '';
                }
                continue;
            }

            if (inQuote) continue;

            if (char === '}') {
                if (braceDepth === 0) {
                    matchingCloseBrace = j;
                }
                braceDepth++;
            } else if (char === '{') {
                braceDepth--;
                if (braceDepth === 0) {
                    lastOpenBrace = j;
                    break;
                }
            }
        }

        if (lastOpenBrace > 0 && matchingCloseBrace > lastOpenBrace) {
            // Extract pattern and action
            const rawPattern = line.substring(0, lastOpenBrace).trim();
            action = line.substring(lastOpenBrace + 1, matchingCloseBrace).trim();

            // Now strip C-style and C++-style comments from the pattern only
            // Be careful not to strip // inside quoted strings like "//"
            pattern = stripPatternComments(rawPattern);
        }

        if (pattern && action !== null) {
            rules.push({
                pattern,
                action,
                lineNo: i + 1,
                priority: rules.length
            });
        } else if (line.includes('{')) {
            // 处理多行动作（简化版）
            // Find first space followed by { to get pattern end
            let patternEnd = -1;
            for (let j = 0; j < line.length - 1; j++) {
                if (line[j] === ' ' && line[j + 1] === '{') {
                    patternEnd = j;
                    break;
                }
            }

            if (patternEnd === -1) {
                // Try to find first {
                patternEnd = line.indexOf('{');
            }

            if (patternEnd > 0) {
                const pat = line.substring(0, patternEnd).trim();
                let act = line.substring(line.indexOf('{') + 1);
                let j = i;

                // 寻找闭合的 }
                while (!act.includes('}') && j < lines.length - 1) {
                    j++;
                    act += '\n' + lines[j];
                }

                const closeIdx = act.indexOf('}');
                if (closeIdx !== -1) {
                    act = act.substring(0, closeIdx);
                    rules.push({
                        pattern: pat,
                        action: act.trim(),
                        lineNo: i + 1,
                        priority: rules.length
                    });
                    i = j;
                }
            }
        }
    }

    return rules;
}

// Strip C-style and C++-style comments from pattern, respecting quoted strings
function stripPatternComments(pattern: string): string {
    let result = '';
    let i = 0;
    let inQuote = false;
    let quoteChar = '';
    let escaped = false;

    while (i < pattern.length) {
        const char = pattern[i];

        // Handle escape sequences
        if (char === '\\' && !escaped) {
            escaped = true;
            result += char;
            i++;
            continue;
        }

        // Handle quotes
        if ((char === '"' || char === "'") && !escaped) {
            if (!inQuote) {
                inQuote = true;
                quoteChar = char;
            } else if (quoteChar === char) {
                inQuote = false;
                quoteChar = '';
            }
            result += char;
            i++;
            escaped = false;
            continue;
        }

        // Skip C-style comments (only outside quotes)
        if (!inQuote && char === '/' && i + 1 < pattern.length && pattern[i + 1] === '*') {
            // Find end of comment
            const endComment = pattern.indexOf('*/', i + 2);
            if (endComment !== -1) {
                i = endComment + 2;
                continue;
            }
        }

        // Skip C++-style comments (only outside quotes)
        if (!inQuote && char === '/' && i + 1 < pattern.length && pattern[i + 1] === '/') {
            // Skip to end of line
            break;
        }

        result += char;
        i++;
        escaped = false;
    }

    return result.trim();
}

export function expandMacros(pattern: string, definitions: Definition[]): string {
    const defMap = new Map(definitions.map(d => [d.name, d.definition]));

    // Stage 1: Escape metacharacters in the original pattern (before macro expansion)
    function escapeOriginalPattern(input: string): string {
        let result = '';
        let i = 0;

        while (i < input.length) {
            const char = input[i];

            // Handle quoted string literals
            if (char === '"') {
                let j = i + 1;
                while (j < input.length) {
                    if (input[j] === '\\' && j + 1 < input.length) {
                        j += 2;
                        continue;
                    } else if (input[j] === '"') {
                        break;
                    } else {
                        j++;
                    }
                }

                if (j < input.length) {
                    const content = input.slice(i + 1, j);
                    result += processEscapes(content);
                    i = j + 1;
                    continue;
                }
            }

            // Handle macro references {NAME} - don't escape, keep as-is
            if (char === '{') {
                const endBrace = input.indexOf('}', i);
                if (endBrace !== -1) {
                    const name = input.slice(i + 1, endBrace);
                    if (defMap.has(name)) {
                        result += input.slice(i, endBrace + 1);
                        i = endBrace + 1;
                        continue;
                    }
                }
            }

            // Handle escape sequences
            if (char === '\\' && i + 1 < input.length) {
                const next = input[i + 1];
                if (next === 'n') {
                    result += '\\n';
                    i += 2;
                    continue;
                } else if (next === 't') {
                    result += '\\t';
                    i += 2;
                    continue;
                } else if (next === 'r') {
                    result += '\\r';
                    i += 2;
                    continue;
                } else if (next === '"') {
                    result += '"';
                    i += 2;
                    continue;
                } else if (next === '\\') {
                    result += '\\';
                    i += 2;
                    continue;
                }
            }

            // For content outside quotes: keep as-is (it's regex)
            // Escape sequences like \n are already handled above
            result += char;
            i++;
        }

        return result;
    }

    // Stage 2: Pure macro expansion, no escaping
    function expandMacrosOnly(input: string): string {
        let result = '';
        let i = 0;

        while (i < input.length) {
            const char = input[i];

            if (char === '{') {
                const endBrace = input.indexOf('}', i);
                if (endBrace !== -1) {
                    const name = input.slice(i + 1, endBrace);
                    if (defMap.has(name)) {
                        result += defMap.get(name)!;
                        i = endBrace + 1;
                        continue;
                    }
                }
            }

            result += char;
            i++;
        }

        return result;
    }

    // Execute: first escape, then recursively expand macros
    let result = escapeOriginalPattern(pattern);
    let changed = true;
    let iterations = 0;
    const MAX_ITERATIONS = 100;

    while (changed && iterations < MAX_ITERATIONS) {
        const newResult = expandMacrosOnly(result);
        changed = newResult !== result;
        result = newResult;
        iterations++;
    }

    return result;
}

// Process escapes and escape metacharacters for quoted content
function processEscapes(content: string): string {
    let result = '';
    let i = 0;
    while (i < content.length) {
        if (content[i] === '\\' && i + 1 < content.length) {
            const next = content[i + 1];
            if (next === 'n') {
                result += '\\n';
            } else if (next === 't') {
                result += '\\t';
            } else if (next === 'r') {
                result += '\\r';
            } else if (next === '"') {
                result += '"';
            } else if (next === '\\') {
                result += '\\';
            } else {
                result += '\\\\' + next;
            }
            i += 2;
        } else if ('*+?[]()|{}.^$/'.includes(content[i])) {
            result += '\\' + content[i];
            i++;
        } else {
            result += content[i];
            i++;
        }
    }
    return result;
}
