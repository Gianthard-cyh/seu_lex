%{
%}

%%

L?\"(\\.|[^\\"\n])*\"  { return(STRING); }
"//".*                  { /* skip single-line comment */ }
"/*"([^*]|\*+[^*/])*\*+"/"  { /* skip multi-line comment */ }
[a-zA-Z_][a-zA-Z0-9_]*  { return(IDENT); }
[ \t\r\n]+              { /* skip whitespace */ }
.                       { return(ERROR); }

%%
