// src/errors.ts

export class SeuLexError extends Error {
    constructor(
        message: string,
        public line?: number,
        public column?: number
    ) {
        super(message);
        this.name = 'SeuLexError';
    }
}

export class LexerSpecError extends SeuLexError {
    constructor(message: string, line?: number, column?: number) {
        super(message, line, column);
        this.name = 'LexerSpecError';
    }
}

export class RegexParseError extends SeuLexError {
    constructor(message: string, public position: number) {
        super(message);
        this.name = 'RegexParseError';
        this.position = position;
    }
}

export class NFAConstructionError extends SeuLexError {
    constructor(message: string) {
        super(message);
        this.name = 'NFAConstructionError';
    }
}

export class GenerationError extends SeuLexError {
    constructor(message: string) {
        super(message);
        this.name = 'GenerationError';
    }
}
