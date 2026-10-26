import type { PageLocator } from './models.ts';
export function normalizeLocator(sourceId: string, marker: string): PageLocator | undefined {
 const raw=marker.replace(/^\[|\]$/g,'').trim();
 const co=/^CO\s+([^,]+),\s*p\.\s*([\w–-]+)$/i.exec(raw);
 const pdf=/^(?:PDF\s+(?:p\.|page)|Frame)\s*([\w–-]+)(?:;\s*printed\s+(?:p\.|page)\s*([\w–-]+))?$/i.exec(raw);
 const printed=/^(?:printed\s+)?p\.\s*([\w–-]+)$/i.exec(raw);
 const marg=/^Marg\.:\s*(.+)$/i.exec(raw);
 const base=`reception:${sourceId}:`;
 // Later upstream units use witness/part fields separated by pipes.
 if(raw.includes('|')) {
  const page=/(?:^|\|)\s*(?:logical\s+)?printed\s+(?:p\.|page)\s*([\w–-]+)/i.exec(raw);
  const pdfPage=/(?:^|\|)\s*PDF\s+(?:p\.|page)\s*([\w–-]+)/i.exec(raw);
  if(page)return {id:base+`p:${page[1]}`,kind:'printed',label:marker,printedPage:page[1]!,...(pdfPage?{pdfPage:pdfPage[1]}:{})};
 }
 const frame=/^Digital\s+frame\s+(\d+);\s*sig\.\s*([A-Za-z0-9]+)[;\s]/i.exec(raw);
 if(frame)return {id:base+`sig:${frame[2]}`,kind:'signature',label:marker,signature:frame[2]!,frame:frame[1]!};
 if(co)return {id:base+`co:${encodeURIComponent(co[1]!)}:p:${co[2]}`,kind:'printed',label:marker,volume:co[1]!,printedPage:co[2]!};
 if(pdf)return {id:base+(pdf[2]?`p:${pdf[2]}`:`pdf:${pdf[1]}`),kind:pdf[2]?'printed':'pdf',label:marker,pdfPage:pdf[1]!,...(pdf[2]?{printedPage:pdf[2]}:{})};
 if(printed)return {id:base+`p:${printed[1]}`,kind:'printed',label:marker,printedPage:printed[1]!};
 if(marg)return {id:base+`marg:${encodeURIComponent(marg[1]!)}`,kind:'marginal',label:marker,marginal:marg[1]!};
 return undefined;
}
export function splitPages(sourceId: string,text: string): {locator:PageLocator;text:string;startOffset:number}[] {
 const markers=[...text.matchAll(/\[[^\]]{1,500}\]/g)].map(m=>({m,locator:normalizeLocator(sourceId,m[0])})).filter(x=>x.locator);
 const out:{locator:PageLocator;text:string;startOffset:number}[]=[];
 if(!markers.length || markers[0]!.m.index!>0)out.push({locator:{id:`reception:${sourceId}:unpaginated`,kind:'unpaginated',label:'Unpaginated preface / document'},text:text.slice(0,markers[0]?.m.index??text.length),startOffset:0});
 markers.forEach(({m,locator},i)=>{const startOffset=m.index!+(locator!.kind==='marginal'?0:m[0].length);out.push({locator:locator!,text:text.slice(startOffset,markers[i+1]?.m.index??text.length),startOffset});});
 return out.filter(p=>p.text.trim());
}
