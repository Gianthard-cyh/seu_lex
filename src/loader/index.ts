// src/loader/index.ts
import { readFileSync } from 'fs';
import type { LexSpec, Definition, Rule } from '../types.js';
import { LexerSpecError } from '../errors.js';

export function load(filename: string): LexSpec {
    const content = readFileSync(filename, 'utf-8');
    return loadFromString(content, filename);
}

export function loadFromString(content: string, filename?: string): LexSpec {
    const lines = content.split('\n');

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
            definitions.push({
                name: match[1],
                definition: match[2]
            });
        }
    }

    return { header, definitions };
}

function parseRules(lines: string[]): Rule[] {
    const rules: Rule[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '' || line.startsWith('/*') || line.startsWith('//')) {
            continue;
        }

        // 匹配规则: pattern { action }
        const match = line.match(/^(\S+)\s+\{(.*)\}$/);
        if (match) {
            rules.push({
                pattern: match[1],
                action: match[2].trim(),
                lineNo: i + 1,
                priority: rules.length
            });
        } else if (line.includes('{')) {
            // 处理多行动作（简化版）
            const patternMatch = line.match(/^(\S+)\s+\{/);
            if (patternMatch) {
                const pattern = patternMatch[1];
                let action = line.substring(line.indexOf('{') + 1);
                let j = i;

                // 寻找闭合的 }
                while (!action.includes('}') && j < lines.length - 1) {
                    j++;
                    action += '\n' + lines[j];
                }

                const closeIdx = action.indexOf('}');
                if (closeIdx !== -1) {
                    action = action.substring(0, closeIdx);
                    rules.push({
                        pattern,
                        action: action.trim(),
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

export function expandMacros(pattern: string, definitions: Definition[]): string {
    // 创建 name -> definition 的映射
    const defMap = new Map(definitions.map(d => [d.name, d.definition]));

    let result = pattern;
    let changed = true;
    let iterations = 0;
    const MAX_ITERATIONS = 100;

    // 迭代展开直到没有变化
    while (changed && iterations < MAX_ITERATIONS) {
        changed = false;
        iterations++;

        // 匹配 {NAME} 模式
        const macroRegex = /\{(\w+)\}/g;
        result = result.replace(macroRegex, (match, name) => {
            if (defMap.has(name)) {
                changed = true;
                return defMap.get(name)!;
            }
            // 未定义的宏，保持原样（会在后续解析时作为字面量处理）
            return match;
        });
    }

    return result;
}
