const fs = require('fs');
const ts = fs.readFileSync('./lib/tsv-parser.ts', 'utf8');
const js = ts.replace(/export function/g, 'function').replace(/: [a-zA-Z0-9_\[\]]+(?: \| null)?/g, '');
eval(js);

const excelStr1 = '"1\n12\n123"\r\n';
const excelStr2 = '"1\r\n12\r\n123"\r\n';
const excelStr3 = '1\n12\n123';
const excelStr4 = '1\r\n12\r\n123\r\n';

console.log('1:', JSON.stringify(parseTsvClipboard(excelStr1)));
console.log('2:', JSON.stringify(parseTsvClipboard(excelStr2)));
console.log('3:', JSON.stringify(parseTsvClipboard(excelStr3)));
console.log('4:', JSON.stringify(parseTsvClipboard(excelStr4)));
