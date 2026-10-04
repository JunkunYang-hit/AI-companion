import {parentPort,workerData} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
try {
  const data=new Uint8Array(readFileSync(workerData.file));
  const task=getDocument({data,useSystemFonts:true});
  const doc=await task.promise;
  if(doc.numPages>2000)throw new Error('PDF 页数超过 2000 页。');
  const pages:string[]=[];
  for(let i=1;i<=doc.numPages;i++){
    const page=await doc.getPage(i);const content=await page.getTextContent();
    pages.push(content.items.map((v:any)=>v.str??'').join(' '));page.cleanup();if(pages.reduce((n,v)=>n+v.length,0)>160000)throw new Error('资料全文最多160000字符。');
  }
  await task.destroy();parentPort?.postMessage({pages});
} catch(e){parentPort?.postMessage({error:e instanceof Error&&e.name==='PasswordException'?'PDF 已加密，请导入无需密码的文本 PDF。':e instanceof Error&&['资料全文最多160000字符。','PDF 页数超过 2000 页。'].includes(e.message)?e.message:'PDF 解析失败或文件过大，请更换文件。'});}
