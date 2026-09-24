// A subprocess keeps the official parser within the Lab timeout/output budget.
import * as commonmark from 'commonmark';
import {readFile} from 'node:fs/promises';
if(process.argv.includes('--version')){
 const metadata=JSON.parse(await readFile(new URL('../package.json',import.meta.resolve('commonmark')),'utf8'));
 console.log('commonmark.js '+metadata.version);
}else{
 let source='';
 process.stdin.setEncoding('utf8');
 for await(const chunk of process.stdin)source+=chunk;
 process.stdout.write(new commonmark.HtmlRenderer({safe:false}).render(new commonmark.Parser().parse(source)));
}
