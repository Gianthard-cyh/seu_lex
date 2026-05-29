%{
/* Keyword lexer - 识别关键字 */
#include <stdio.h>
%}

%%
if                        { printf("KEYWORD:if\n"); }
else                      { printf("KEYWORD:else\n"); }
while                     { printf("KEYWORD:while\n"); }
return                    { printf("KEYWORD:return\n"); }
[a-zA-Z_][a-zA-Z0-9_]*    { printf("ID:%s\n", yytext); }
[0-9]+                    { printf("NUM:%s\n", yytext); }
[ \t\n]+                  { /* skip whitespace */ }
.                         { printf("CHAR:%s\n", yytext); }

%%

int yywrap(void) { return 1; }
