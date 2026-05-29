/* json_tokens.h - Token definitions for JSON lexer */
#ifndef JSON_TOKENS_H
#define JSON_TOKENS_H

/* Literals */
#define STRING 1
#define NUMBER 2

/* Keywords */
#define TRUE 10
#define FALSE 11
#define NULL_TOKEN 12

/* Punctuation */
#define LBRACE 20
#define RBRACE 21
#define LBRACKET 22
#define RBRACKET 23
#define COLON 24
#define COMMA 25

/* Error */
#define ERROR 99

#endif /* JSON_TOKENS_H */
