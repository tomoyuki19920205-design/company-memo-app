const fs = require('fs');
const ts = fs.readFileSync('./lib/tsv-parser.ts', 'utf8');
const js = ts.replace(/export function/g, 'function').replace(/: [a-zA-Z0-9_\[\]]+(?: \| null)?/g, '');
eval(js);

const oneCellStr = '"1\r\n12\r\n123"\r\n';
const threeCellsStr = '1\r\n12\r\n123\r\n';

console.log("One Cell:", JSON.stringify(parseTsvClipboard(oneCellStr)));
console.log("Three Cells:", JSON.stringify(parseTsvClipboard(threeCellsStr)));
