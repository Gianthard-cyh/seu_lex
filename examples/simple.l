%{
#include <stdio.h>
%}

%%
[0-9]+          { printf("NUMBER: %s\n", yytext); return 1; }
[a-zA-Z]+       { printf("WORD: %s\n", yytext); return 2; }
[ \t\n]+        { /* ignore whitespace */ }
.               { printf("UNKNOWN: %c\n", *yytext); return -1; }

%%

int main() {
    yyin = stdin;
    while (yylex() != 0);
    return 0;
}
