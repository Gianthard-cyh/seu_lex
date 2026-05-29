%{
#include <stdio.h>
%}

%%
[0-9]+          { printf("%d:%d NUMBER \"%s\"\n", yylineno, yycol, yytext); return 1; }
[a-zA-Z_][a-zA-Z0-9_]*  { printf("%d:%d IDENT \"%s\"\n", yylineno, yycol, yytext); return 2; }
[ \t]+          { /* ignore whitespace */ }
\n              { printf("%d:%d NEWLINE \"\\n\"\n", yylineno, yycol); return 3; }
.               { printf("%d:%d UNKNOWN \"%c\"\n", yylineno, yycol, *yytext); return -1; }

%%

int main() {
    yyin = stdin;
    while (yylex() != 0);
    return 0;
}
