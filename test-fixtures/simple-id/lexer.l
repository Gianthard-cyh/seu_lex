%{
/* Simple identifier lexer - 识别标识符和数字 */
#include <stdio.h>
%}

%%
[a-zA-Z_][a-zA-Z0-9_]*    { printf("ID:%s\n", yytext); }
[0-9]+                    { printf("NUM:%s\n", yytext); }
[ \t\n]+                  { /* skip whitespace */ }
.                         { printf("UNKNOWN:%s\n", yytext); }

%%

int yywrap(void) { return 1; }
