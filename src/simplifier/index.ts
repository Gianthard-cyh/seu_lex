// src/simplifier/index.ts
import type { NFA, DFA, State } from '../types.js';
import { DFA as DFACtor, setKey } from '../types.js';

// ε-闭包：通过 ε-转移可达的所有状态
export function epsilonClosure(states: Set<State>): Set<State> {
    const stack = Array.from(states);
    const closure = new Set(states);

    while (stack.length > 0) {
        const state = stack.pop()!;

        for (const trans of state.transitions) {
            if (trans.type === 'epsilon') {
                if (!closure.has(trans.to)) {
                    closure.add(trans.to);
                    stack.push(trans.to);
                }
            }
        }
    }

    return closure;
}

// Move：从状态集通过字符 c 能直接到达的状态（不计算 ε-闭包）
export function move(states: Set<State>, char: number): Set<State> {
    const result = new Set<State>();

    for (const state of states) {
        for (const trans of state.transitions) {
            if (trans.type === 'char' && trans.char === char) {
                result.add(trans.to);
            } else if (trans.type === 'class') {
                // 检查字符是否在字符类中
                const cls = trans.class;
                let inClass = false;
                if (cls.singles.includes(char)) inClass = true;
                for (const [start, end] of cls.ranges) {
                    if (char >= start && char <= end) {
                        inClass = true;
                        break;
                    }
                }
                if (cls.negated ? !inClass : inClass) {
                    result.add(trans.to);
                }
            }
        }
    }

    return result;
}

// 收集状态集合中所有可能的转移字符
function collectPossibleChars(states: Set<State>): number[] {
    const chars = new Set<number>();

    for (const state of states) {
        for (const trans of state.transitions) {
            if (trans.type === 'char') {
                chars.add(trans.char);
            } else if (trans.type === 'class') {
                for (const single of trans.class.singles) {
                    chars.add(single);
                }
                for (const [start, end] of trans.class.ranges) {
                    for (let c = start; c <= end; c++) {
                        chars.add(c);
                    }
                }
            }
        }
    }

    return Array.from(chars).sort((a, b) => a - b);
}

// 子集构造法：NFA → DFA
export function subsetConstruction(nfa: NFA): DFA {
    const dfa = new DFACtor();

    // 状态集合 → DFA 状态 ID 的映射
    const visited = new Map<string, number>();

    // 工作队列（BFS）
    const worklist: Set<State>[] = [];

    // 初始状态 = NFA 起始状态的 ε-闭包
    const startSet = epsilonClosure(new Set([nfa.start]));
    const startId = dfa.addState(startSet);
    dfa.startStateId = startId;

    worklist.push(startSet);
    visited.set(setKey(startSet), startId);

    while (worklist.length > 0) {
        const current = worklist.shift()!;
        const fromId = visited.get(setKey(current))!;

        // 确定当前状态是否为接受状态
        let acceptRule = -1;
        for (const state of current) {
            if (state.isAccept) {
                if (acceptRule === -1 || state.acceptRule < acceptRule) {
                    acceptRule = state.acceptRule;
                }
            }
        }
        dfa.states[fromId].isAccept = acceptRule !== -1;
        dfa.states[fromId].acceptRule = acceptRule;

        // 对于每个可能的输入字符
        const chars = collectPossibleChars(current);

        for (const char of chars) {
            const next = epsilonClosure(move(current, char));

            if (next.size === 0) {
                dfa.states[fromId].transitions[char] = -1;
                continue;
            }

            const key = setKey(next);
            let toId = visited.get(key);

            if (toId === undefined) {
                toId = dfa.addState(next);
                visited.set(key, toId);
                worklist.push(next);
            }

            dfa.states[fromId].transitions[char] = toId;
        }
    }

    return dfa;
}

// Hopcroft 算法：DFA 最小化
export function minimize(dfa: DFA): DFA {
    if (dfa.states.length <= 1) {
        return dfa;
    }

    // 初始化分区：接受状态（按规则分组）/ 非接受状态
    const partition = new Map<number, number>();
    const groups: Set<number>[] = [];

    // 收集接受状态和非接受状态
    const acceptByRule = new Map<number, Set<number>>();
    const nonAcceptStates = new Set<number>();

    for (const state of dfa.states) {
        if (state.isAccept) {
            if (!acceptByRule.has(state.acceptRule)) {
                acceptByRule.set(state.acceptRule, new Set());
            }
            acceptByRule.get(state.acceptRule)!.add(state.id);
        } else {
            nonAcceptStates.add(state.id);
        }
    }

    // 初始化组
    let groupId = 0;
    for (const [ruleId, states] of acceptByRule) {
        groups.push(states);
        for (const stateId of states) {
            partition.set(stateId, groupId);
        }
        groupId++;
    }

    if (nonAcceptStates.size > 0) {
        groups.push(nonAcceptStates);
        for (const stateId of nonAcceptStates) {
            partition.set(stateId, groupId);
        }
        groupId++;
    }

    // 工作队列
    const worklist = new Set<number>();
    for (let i = 0; i < groups.length; i++) {
        worklist.add(i);
    }

    // 主循环
    while (worklist.size > 0) {
        const A = worklist.values().next().value!;
        worklist.delete(A);

        // 对于每个可能的输入字符
        for (let c = 0; c < 256; c++) {
            const X = new Set<number>();
            for (const stateId of partition.keys()) {
                const nextId = dfa.states[stateId].transitions[c];
                if (nextId !== -1 && partition.get(nextId) === A) {
                    X.add(stateId);
                }
            }

            if (X.size === 0) continue;

            // 检查每个组是否需要分裂
            for (let g = 0; g < groups.length; g++) {
                const group = groups[g];
                const intersection = new Set<number>();
                const difference = new Set<number>();

                for (const stateId of group) {
                    if (X.has(stateId)) {
                        intersection.add(stateId);
                    } else {
                        difference.add(stateId);
                    }
                }

                if (intersection.size === 0 || difference.size === 0) {
                    continue;
                }

                // 分裂组
                if (intersection.size <= difference.size) {
                    groups[g] = intersection;
                    const newGroupId = groups.length;
                    groups.push(difference);

                    for (const stateId of intersection) {
                        partition.set(stateId, g);
                    }
                    for (const stateId of difference) {
                        partition.set(stateId, newGroupId);
                    }

                    if (worklist.has(g)) {
                        worklist.add(newGroupId);
                    } else {
                        worklist.add(intersection.size <= difference.size ? g : newGroupId);
                    }
                } else {
                    groups[g] = difference;
                    const newGroupId = groups.length;
                    groups.push(intersection);

                    for (const stateId of difference) {
                        partition.set(stateId, g);
                    }
                    for (const stateId of intersection) {
                        partition.set(stateId, newGroupId);
                    }

                    if (worklist.has(g)) {
                        worklist.add(newGroupId);
                    } else {
                        worklist.add(difference.size < intersection.size ? g : newGroupId);
                    }
                }
            }
        }
    }

    // 重建最小化 DFA
    return rebuildDFA(dfa, partition, groups);
}

// 重建 DFA
function rebuildDFA(
    oldDFA: DFA,
    partition: Map<number, number>,
    groups: Set<number>[]
): DFA {
    const newDFA = new DFACtor();

    const groupToNewId = new Map<number, number>();

    // 创建新状态
    for (let g = 0; g < groups.length; g++) {
        const newId = newDFA.addState(new Set());
        groupToNewId.set(g, newId);

        const firstStateId = Array.from(groups[g])[0];
        const oldState = oldDFA.states[firstStateId];
        newDFA.states[newId].isAccept = oldState.isAccept;
        newDFA.states[newId].acceptRule = oldState.acceptRule;
    }

    // 设置起始状态
    const oldStartGroup = partition.get(oldDFA.startStateId)!;
    newDFA.startStateId = groupToNewId.get(oldStartGroup)!;

    // 创建转移
    for (let g = 0; g < groups.length; g++) {
        const fromNewId = groupToNewId.get(g)!;
        const firstStateId = Array.from(groups[g])[0];
        const oldState = oldDFA.states[firstStateId];

        for (let c = 0; c < 256; c++) {
            const oldNextId = oldState.transitions[c];
            if (oldNextId !== -1) {
                const nextGroup = partition.get(oldNextId)!;
                const toNewId = groupToNewId.get(nextGroup)!;
                newDFA.states[fromNewId].transitions[c] = toNewId;
            }
        }
    }

    return newDFA;
}

// 简化：NFA → DFA → 最小化 DFA
export function simplify(nfa: NFA): DFA {
    const dfa = subsetConstruction(nfa);
    return minimize(dfa);
}

export interface SimplifyInfo {
    nfaStates: number;
    dfaStatesBefore: number;
    dfaStatesAfter: number;
    compressionRatio: number;
}

export function getSimplifyInfo(dfa: DFA): SimplifyInfo {
    // 这里简化实现，实际需要在简化过程中记录中间结果
    return {
        nfaStates: -1,
        dfaStatesBefore: dfa.states.length,
        dfaStatesAfter: dfa.states.length,
        compressionRatio: 0
    };
}
