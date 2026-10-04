// Original geometric character, drawn from circles/ellipses; no third-party artwork.
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
const root='assets/default-character';await mkdir(root,{recursive:true});
function crc32(b){let c=0xffffffff;for(const v of b){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type),n=Buffer.alloc(4),crc=Buffer.alloc(4);n.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([n,t,data,crc]);}
function png(blink=false,lean=0){
  const width=256,height=256,pixels=Buffer.alloc(height*(width*4+1));
  const ellipse=(x,y,cx,cy,rx,ry)=>(x-cx)**2/rx**2+(y-cy)**2/ry**2<=1;
  const shapes=[
    [128,226,67,9,[29,57,46,30]],
    [88+lean,217,22,10,[63,100,74,255]],[168+lean,217,22,10,[63,100,74,255]],
    [65+lean,153,21,32,[159,196,153,255]],[191+lean,153,21,32,[159,196,153,255]],
    [128+lean,139,73,79,[63,100,74,255]],[128+lean,137,68,74,[207,227,179,255]],
    [115+lean,67,16,9,[223,237,198,255]],
    [122+lean,48,5,26,[63,100,74,255]],[108+lean,37,18,10,[120,172,115,255]],[139+lean,28,20,12,[96,154,99,255]],
    [92+lean,153,14,8,[238,165,151,255]],[164+lean,153,14,8,[238,165,151,255]],
    [102+lean,132,6,blink?2:9,[45,67,53,255]],[154+lean,132,6,blink?2:9,[45,67,53,255]],
    [128+lean,155,9,7,[45,67,53,255]],[128+lean,150,11,7,[207,227,179,255]],
    [126+lean,186,6,6,[244,240,206,255]]
  ];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    // 2x2 supersampling for smooth transparent edges.
    let sums=[0,0,0,0];for(const [dx,dy] of [[.25,.25],[.75,.25],[.25,.75],[.75,.75]]){
      let color=[0,0,0,0];for(const [cx,cy,rx,ry,rgba] of shapes)if(ellipse(x+dx,y+dy,cx,cy,rx,ry))color=rgba;
      for(let k=0;k<4;k++)sums[k]+=color[k];
    }
    const offset=y*(width*4+1)+1+x*4;for(let k=0;k<4;k++)pixels[offset+k]=Math.round(sums[k]/4);
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
for(const [file,blink,lean] of [['idle.png',false,0],['blink.png',true,0],['walk-1.png',false,-4],['walk-2.png',false,4]])await writeFile(`${root}/${file}`,png(blink,lean));
const iconPng=png();const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[6]=0;ico[7]=0;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32BE(0,0);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico.writeUInt32LE(iconPng.length,14);ico.writeUInt32LE(22,18);await writeFile(`${root}/icon.ico`,Buffer.concat([ico,iconPng]));
await writeFile(`${root}/character.json`,JSON.stringify({schema_version:1,id:'default-xiaoqi',name:'小栖',persona_text:'你是小栖，一个温柔、好奇、有一点俏皮的桌面伙伴。陪用户学习、工作和生活，回应简短自然。',visual_type:'frames',asset_paths:{idle:['idle.png','blink.png'],walk:['walk-1.png','walk-2.png'],click:['blink.png'],sleep:['blink.png']},supported_actions:['idle','walk','click','sleep'],fallback_action:'idle',license:'MIT',source:'Original geometric artwork in scripts/create-character.mjs'},null,2));
