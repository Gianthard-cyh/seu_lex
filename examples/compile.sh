#!/bin/bash
# 编译示例脚本

echo "Compiling simple.l..."
npx tsx -e "
import { compile } from './src/index.js';
await compile('./examples/simple.l', './examples/lex.yy.c');
console.log('Generated: ./examples/lex.yy.c');
"

echo ""
echo "Building C lexer..."
gcc -o ./examples/lexer ./examples/lex.yy.c

echo ""
echo "Testing lexer..."
echo -e "123\nhello\n!" | ./examples/lexer

echo ""
echo "Done!"
