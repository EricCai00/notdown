import {parseFragment} from 'parse5';

const blocks=new Set(['address','article','aside','blockquote','dd','div','dl','dt','fieldset','figcaption','figure','footer','form','h1','h2','h3','h4','h5','h6','header','hr','li','main','nav','ol','p','pre','section','table','tbody','td','tfoot','th','thead','tr','ul']);
/** Conservative DOM normalization: do not erase classes, IDs, URLs, marks,
 * list paragraph wrappers, table alignment, or pre/code whitespace. */
export function canonicalHtml(html:string):string {
 const root:any=parseFragment(html);
 function node(n:any, literal=false):any {
   if(n.nodeName==='#comment')return ['comment',n.data];
   if(n.nodeName==='#text')return ['text',literal?n.value:n.value.replace(/[\t\n\r ]+/g,' ')];
   const pre=literal||n.tagName==='pre'||n.tagName==='code';
   const children=(n.content?.childNodes||n.childNodes||[]);
   const content=children.filter((c:any,i:number)=>{
     if(pre||c.nodeName!=='#text'||!/^[\t\n\r ]*$/.test(c.value))return true;
     const prev=children[i-1],next=children[i+1];
     // Only discard formatting between block elements or at block boundaries.
     return !((!prev||blocks.has(prev.tagName))&&(!next||blocks.has(next.tagName)));
   }).map((c:any)=>node(c,pre));
   return [n.tagName||'fragment',(n.attrs||[]).map((a:any)=>[a.name,a.value]).sort((a:any,b:any)=>a[0].localeCompare(b[0])),content];
 }
 return JSON.stringify(node(root));
}

/** Additional diagnostic only. Matching text does NOT imply equivalent HTML. */
export function visibleText(html:string):string {
 function walk(n:any):string {
   if(['script','style'].includes(n.tagName)||n.nodeName==='#comment')return '';
   if(n.nodeName==='#text')return n.value;
   if(n.tagName==='img')return n.attrs.find((a:any)=>a.name==='alt')?.value||'';
   return (n.childNodes||[]).map(walk).join('')+ (blocks.has(n.tagName)||n.tagName==='br'?'\n':'');
 }
 return walk(parseFragment(html)).replace(/\s+/g,' ').trim();
}
export function compareHtml(reference:string,actual:string){
 return {rawEqual:reference===actual,domEqual:canonicalHtml(reference)===canonicalHtml(actual),textEqual:visibleText(reference)===visibleText(actual)};
}
