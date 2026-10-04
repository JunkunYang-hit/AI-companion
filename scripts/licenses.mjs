import {readFile,readdir,mkdir,copyFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
const lock=JSON.parse(await readFile('package-lock.json','utf8')),rows=[];
await mkdir('docs/licenses',{recursive:true});
for(const [location,record] of Object.entries(lock.packages)){
  if(!location)continue;if((record.dev||record.devOptional)&&!/^node_modules\/(?:@pixi\/|pixi\.js$|pixi-live2d-display$)/.test(location))continue;
  try{
    const json=JSON.parse(await readFile(path.join(location,'package.json'),'utf8'));
    const dir=path.join('docs/licenses',json.name.replace(/[@/]/g,'_')+'-'+json.version);await mkdir(dir,{recursive:true});let copied=0;
    for(const name of await readdir(location))if(/^(licen[cs]e|copying|notice)(\.|$|-)/i.test(name)&& (await stat(path.join(location,name))).isFile()){await copyFile(path.join(location,name),path.join(dir,name));copied++;}
    rows.push(`| ${json.name} | ${json.version} | ${json.license??record.license??'see package'} | ${copied?'docs/licenses/'+path.basename(dir):'原 npm 包'} |`);
  }catch{/* Optional dependencies for other operating systems are not shipped on Windows. */}
}
await writeFile('NOTICE.md','# Third-party notices\n\n本项目原创代码与默认几何角色采用 MIT。下列库保留其各自许可，详细文本在 docs/licenses。Electron 安装包另包含 Electron LICENSE 和 Chromium LICENSES.chromium.html。未复制候选桌宠源码。\n\n| Package | Version | License | License text |\n|---|---|---|---|\n'+rows.join('\n')+'\n'+await readFile('docs/asset-notices.md','utf8'));
console.log('Production licenses recorded:',rows.length);
