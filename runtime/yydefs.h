/* SeuLex runtime definitions - Flex compatible */
#ifndef YYDEFS_H
#define YYDEFS_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ===== Global Variables ===== */
extern char *yytext;
extern int yyleng;
extern FILE *yyin;
extern FILE *yyout;

/* ===== Flex Compatibility Macros ===== */
#ifndef ECHO
#define ECHO fprintf(yyout, "%s", yytext)
#endif

/* ===== Function Declarations ===== */

/* Main lexer function */
int yylex(void);

/* Input/output setup */
void yyset_in(FILE *fp);
void yyset_out(FILE *fp);
FILE *yyget_in(void);
FILE *yyget_out(void);

/* Flex compatibility functions for user actions */
int input(void);
void unput(int c);
void output(int c);

/* YYwrap - called at EOF */
int yywrap(void);

/* Helper functions that may be used in actions */
void yyrestart(FILE *fp);

#endif /* YYDEFS_H */
