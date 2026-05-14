/* y.tab.h - Token definitions for C99 lexer */
#ifndef Y_TAB_H
#define Y_TAB_H

/* Keywords */
#define AUTO 1
#define BOOL 2
#define BREAK 3
#define CASE 4
#define CHAR 5
#define COMPLEX 6
#define CONST 7
#define CONTINUE 8
#define DEFAULT 9
#define DO 10
#define DOUBLE 11
#define ELSE 12
#define ENUM 13
#define EXTERN 14
#define FLOAT 15
#define FOR 16
#define GOTO 17
#define IF 18
#define IMAGINARY 19
#define INLINE 20
#define INT 21
#define LONG 22
#define REGISTER 23
#define RESTRICT 24
#define RETURN 25
#define SHORT 26
#define SIGNED 27
#define SIZEOF 28
#define STATIC 29
#define STRUCT 30
#define SWITCH 31
#define TYPEDEF 32
#define UNION 33
#define UNSIGNED 34
#define VOID 35
#define VOLATILE 36
#define WHILE 37

/* Identifiers */
#define IDENTIFIER 100

/* Constants */
#define CONSTANT 101

/* String literals */
#define STRING_LITERAL 102

/* Operators */
#define ELLIPSIS 200
#define RIGHT_ASSIGN 201
#define LEFT_ASSIGN 202
#define ADD_ASSIGN 203
#define SUB_ASSIGN 204
#define MUL_ASSIGN 205
#define DIV_ASSIGN 206
#define MOD_ASSIGN 207
#define AND_ASSIGN 208
#define XOR_ASSIGN 209
#define OR_ASSIGN 210
#define RIGHT_OP 211
#define LEFT_OP 212
#define INC_OP 213
#define DEC_OP 214
#define PTR_OP 215
#define AND_OP 216
#define OR_OP 217
#define LE_OP 218
#define GE_OP 219
#define EQ_OP 220
#define NE_OP 221

/* Type names */
#define TYPE_NAME 300

/* Single character tokens use their ASCII value */

#endif /* Y_TAB_H */
