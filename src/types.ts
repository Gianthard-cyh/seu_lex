// src/types.ts

export interface LexSpec {
    header: string;
    definitions: Definition[];
    rules: Rule[];
    trailer: string;
}

export interface Definition {
    name: string;
    definition: string;
}

export interface Rule {
    pattern: string;
    action: string;
    lineNo: number;
    priority: number;
}

// NFA Types
export class State {
    id: number;
    transitions: Transition[] = [];
    isAccept: boolean = false;
    acceptRule: number = -1;

    constructor(id: number) {
        this.id = id;
    }
}

export type Transition =
    | { type: 'epsilon'; to: State }
    | { type: 'char'; char: number; to: State }
    | { type: 'class'; class: CharClass; to: State };

export class NFA {
    start: State;
    accept: State;
    states: State[];
    private stateCounter: number;

    constructor(start?: State, accept?: State, states?: State[]) {
        this.stateCounter = 0;
        this.start = start || this.newState();
        this.accept = accept || this.newState();
        this.states = states || [this.start, this.accept];
        if (!start) {
            this.accept.isAccept = true;
        }
        this.stateCounter = this.states.length;
    }

    newState(): State {
        const s = new State(this.stateCounter++);
        return s;
    }

    clone(): NFA {
        const stateMap = new Map<State, State>();
        const newStates: State[] = [];
        let nextId = 0;

        for (const s of this.states) {
            const ns = new State(nextId++);
            ns.isAccept = s.isAccept;
            ns.acceptRule = s.acceptRule;
            stateMap.set(s, ns);
            newStates.push(ns);
        }

        for (const s of this.states) {
            const ns = stateMap.get(s)!;
            for (const t of s.transitions) {
                const newTrans: Transition =
                    t.type === 'epsilon'
                        ? { type: 'epsilon', to: stateMap.get(t.to)! }
                        : t.type === 'char'
                          ? { type: 'char', char: t.char, to: stateMap.get(t.to)! }
                          : { type: 'class', class: t.class, to: stateMap.get(t.to)! };
                ns.transitions.push(newTrans);
            }
        }

        return new NFA(
            stateMap.get(this.start)!,
            stateMap.get(this.accept)!,
            newStates
        );
    }
}

// Character class
export interface CharClass {
    negated: boolean;
    ranges: [number, number][];
    singles: number[];
}

export function matchesClass(char: number, cls: CharClass): boolean {
    if (char < 0 || char > 255) return false;

    let inClass = false;

    if (cls.singles.includes(char)) {
        inClass = true;
    }

    for (const [start, end] of cls.ranges) {
        if (char >= start && char <= end) {
            inClass = true;
            break;
        }
    }

    return cls.negated ? !inClass : inClass;
}

// Regex AST
export type RegexAST =
    | { type: 'char'; char: number }
    | { type: 'class'; class: CharClass }
    | { type: 'any' }
    | { type: 'concat'; left: RegexAST; right: RegexAST }
    | { type: 'union'; left: RegexAST; right: RegexAST }
    | { type: 'star'; child: RegexAST }
    | { type: 'plus'; child: RegexAST }
    | { type: 'optional'; child: RegexAST }
    | { type: 'range'; child: RegexAST; min: number; max: number | null };

// DFA Types
export class DFAState {
    id: number;
    nfaStates: Set<State>;
    transitions: Int16Array;
    isAccept: boolean = false;
    acceptRule: number = -1;

    constructor(id: number, nfaStates: Set<State>) {
        this.id = id;
        this.nfaStates = nfaStates;
        this.transitions = new Int16Array(256).fill(-1);
    }
}

export class DFA {
    states: DFAState[] = [];
    startStateId: number = -1;
    private stateCounter: number = 0;

    addState(nfaStates: Set<State>): number {
        const id = this.stateCounter++;
        const state = new DFAState(id, nfaStates);
        this.states.push(state);
        return id;
    }

    getTransition(stateId: number, char: number): number | null {
        if (stateId < 0 || stateId >= this.states.length) return null;
        const t = this.states[stateId].transitions[char];
        return t === -1 ? null : t;
    }

    setTransition(fromId: number, char: number, toId: number): void {
        if (fromId >= 0 && fromId < this.states.length) {
            this.states[fromId].transitions[char] = toId;
        }
    }
}

// Helper functions
export function setKey(states: Set<State>): string {
    const ids = Array.from(states)
        .map(s => s.id)
        .sort((a, b) => a - b);
    return ids.join(',');
}
