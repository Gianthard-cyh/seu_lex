%{
/* Number-only lexer - 只识别数字 */
#include <stdio.h>
%}

%%
[0-9]+                    { printf("NUMBER:%s\n", yytext); }
[ \t\n]+                  { /* skip whitespace */ }

%%

int yywrap(void) { return 1; }
