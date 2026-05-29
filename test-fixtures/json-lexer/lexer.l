/* JSON Lexer - Recognizes JSON tokens */

%{
#include <stdio.h>
#include "json_tokens.h"

void count(void);
%}

/* Definitions */
DIGIT       [0-9]
HEX         [0-9a-fA-F]
ESC         \\([\"\\/bfnrt]|u{HEX}{4})
STRING_CHAR [^\"\\\x00-\x1f]|{ESC}
INT         -?(0|[1-9]{DIGIT}*)
EXP         [eE][+-]?{DIGIT}+

%%

[ \t\r\n]+          { count(); /* consume whitespace */ }

\"{STRING_CHAR}*\"  { count(); return STRING; }

{INT}               { count(); return NUMBER; }
{INT}\.{DIGIT}+     { count(); return NUMBER; }
{INT}{EXP}          { count(); return NUMBER; }
{INT}\.{DIGIT}+{EXP} { count(); return NUMBER; }

"true"              { count(); return TRUE; }
"false"             { count(); return FALSE; }
"null"              { count(); return NULL_TOKEN; }

"{"                 { count(); return LBRACE; }
"}"                 { count(); return RBRACE; }
"["                 { count(); return LBRACKET; }
"]"                 { count(); return RBRACKET; }
":"                 { count(); return COLON; }
","                 { count(); return COMMA; }

.                   { count(); return ERROR; }

%%

int yywrap(void)
{
    return 1;
}

int column = 0;

void count(void)
{
    int i;
    for (i = 0; yytext[i] != '\0'; i++) {
        if (yytext[i] == '\n')
            column = 0;
        else if (yytext[i] == '\t')
            column += 8 - (column % 8);
        else
            column++;
    }
}
