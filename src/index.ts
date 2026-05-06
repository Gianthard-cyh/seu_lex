// src/index.ts
import { load, loadFromString, expandMacros } from './loader/index.js';
import { parse, RegexLexer, RegexParser, buildFromAST } from './reparser/index.js';
import { merge, getMergeInfo, type MergedNFAInfo } from './merger/index.js';
import { simplify, subsetConstruction, minimize, epsilonClosure, move, getSimplifyInfo, type SimplifyInfo } from './simplifier/index.js';
import { generate, generateToString, generateParts, generateWithOptions, type GenerateOptions, type GeneratedCode } from './generator/index.js';
import { SeuLexError, LexerSpecError, RegexParseError, NFAConstructionError, GenerationError } from './errors.js';
import type { LexSpec, Definition, Rule, NFA, State, Transition, CharClass, RegexAST, DFA, DFAState } from './types.js';

export interface CompileOptions {
    output?: string;
    optimize?: boolean;
    verbose?: boolean;
}

export async function compile(inputFile: string, outputFile?: string): Promise<void> {
    const spec = load(inputFile);

    // 解析所有规则为正则 NFA
    const nfas = spec.rules.map(r => parse(r.pattern));

    // 合并 NFA
    const merged = merge(nfas, spec.rules);

    // 简化为 DFA
    const dfa = simplify(merged);

    // 生成代码
    const output = outputFile || 'lex.yy.c';
    await generate(dfa, spec, output);
}

export async function compileWithOptions(
    inputFile: string,
    options: CompileOptions
): Promise<void> {
    const spec = load(inputFile);

    // 解析所有规则为正则 NFA
    const nfas = spec.rules.map(r => parse(r.pattern));

    // 合并 NFA
    const merged = merge(nfas, spec.rules);

    // 简化为 DFA
    const dfa = options.optimize !== false
        ? simplify(merged)
        : subsetConstruction(merged);

    // 生成代码
    const output = options.output || 'lex.yy.c';
    await generate(dfa, spec, output);

    if (options.verbose) {
        console.log(`Generated: ${output}`);
        console.log(`States: ${dfa.states.length}`);
        console.log(`Rules: ${spec.rules.length}`);
    }
}

// 导出所有模块
export {
    // Loader
    load,
    loadFromString,
    expandMacros,

    // ReParser
    parse,
    RegexLexer,
    RegexParser,
    buildFromAST,

    // Merger
    merge,
    getMergeInfo,
    type MergedNFAInfo,

    // Simplifier
    simplify,
    subsetConstruction,
    minimize,
    epsilonClosure,
    move,
    getSimplifyInfo,
    type SimplifyInfo,

    // Generator
    generate,
    generateToString,
    generateParts,
    generateWithOptions,
    type GenerateOptions,
    type GeneratedCode,

    // Errors
    SeuLexError,
    LexerSpecError,
    RegexParseError,
    NFAConstructionError,
    GenerationError,

    // Types
    type LexSpec,
    type Definition,
    type Rule,
    type NFA,
    type State,
    type Transition,
    type CharClass,
    type RegexAST,
    type DFA,
    type DFAState
};

// 默认导出
export default {
    compile,
    compileWithOptions,
    load,
    parse,
    merge,
    simplify,
    generate
};
