// src/merger/index.ts
import { NFA, State } from '../types.js';
import type { Rule } from '../types.js';

export interface MergedNFAInfo {
    originalCount: number;
    totalStates: number;
    acceptStates: number;
}

export function merge(nfas: NFA[], rules: Rule[]): NFA {
    if (nfas.length === 0) {
        return new NFA();
    }

    if (nfas.length === 1) {
        const nfa = nfas[0];
        // 设置所有接受状态的 acceptRule
        for (const state of nfa.states) {
            if (state.isAccept) {
                state.acceptRule = rules[0]?.priority ?? 0;
            }
        }
        return nfa;
    }

    // 创建新的合并 NFA
    const merged = new NFA();
    const newStart = merged.newState();
    merged.start = newStart;

    // 第一步：收集所有状态和 ID 映射
    const allStates: State[] = [newStart];
    const stateMaps: Map<number, State>[] = []; // 每个 NFA 的 ID 映射

    for (let i = 0; i < nfas.length; i++) {
        const nfa = nfas[i];
        const stateMap = new Map<number, State>();

        // 去重：基于状态 ID
        const seenIds = new Set<number>();
        const uniqueStates: State[] = [];
        for (const state of nfa.states) {
            if (!seenIds.has(state.id)) {
                seenIds.add(state.id);
                uniqueStates.push(state);
            }
        }

        // 为新状态分配 ID
        for (const state of uniqueStates) {
            const newId = allStates.length;

            const newState = new State(newId);
            newState.isAccept = state.isAccept;
            newState.acceptRule = state.isAccept ? rules[i]?.priority ?? i : -1;

            allStates.push(newState);
            stateMap.set(state.id, newState);
        }

        stateMaps.push(stateMap);
    }

    // 第二步：建立转移
    for (let i = 0; i < nfas.length; i++) {
        const nfa = nfas[i];
        const stateMap = stateMaps[i];

        // 获取该 NFA 的起始状态映射
        const startState = stateMap.get(nfa.start.id)!;

        // 添加从 newStart 的 ε-转移（只添加一次）
        newStart.transitions.push({ type: 'epsilon', to: startState });

        // 使用去重后的状态列表（基于 ID）
        const seenIds = new Set<number>();
        const uniqueStates: State[] = [];
        for (const state of nfa.states) {
            if (!seenIds.has(state.id)) {
                seenIds.add(state.id);
                uniqueStates.push(state);
            }
        }

        for (const state of uniqueStates) {
            const newState = stateMap.get(state.id)!;

            for (const trans of state.transitions) {
                const targetState = stateMap.get(trans.to.id)!;

                if (trans.type === 'epsilon') {
                    newState.transitions.push({ type: 'epsilon', to: targetState });
                } else if (trans.type === 'char') {
                    newState.transitions.push({ type: 'char', char: trans.char, to: targetState });
                } else {
                    newState.transitions.push({ type: 'class', class: trans.class, to: targetState });
                }
            }
        }
    }

    // 设置接受状态（任选一个）
    let acceptState: State | null = null;
    for (const state of allStates) {
        if (state.isAccept) {
            acceptState = state;
            break;
        }
    }

    if (!acceptState) {
        acceptState = merged.newState();
        allStates.push(acceptState);
    }

    merged.accept = acceptState;
    merged.states = allStates;

    return merged;
}

export function getMergeInfo(nfa: NFA): MergedNFAInfo {
    const acceptStates = nfa.states.filter(s => s.isAccept);

    return {
        originalCount: nfa.start.transitions.filter(t => t.type === 'epsilon').length,
        totalStates: nfa.states.length,
        acceptStates: acceptStates.length
    };
}
