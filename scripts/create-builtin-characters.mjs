import {readFile,writeFile,mkdir,copyFile,access} from 'node:fs/promises';
import {inflateSync,deflateSync} from 'node:zlib';
const root='assets/characters';await mkdir(root,{recursive:true});
function crc32(b){let c=0xffffffff;for(const v of b){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type),n=Buffer.alloc(4),crc=Buffer.alloc(4);n.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([n,t,data,crc]);}
const pink=root+'/momo';await mkdir(pink,{recursive:true});
for(const name of ['idle.png','blink.png','walk-1.png','walk-2.png']){
 const source=await readFile('assets/default-character/'+name),compressed=[];let header;
 for(let i=8;i<source.length;){const size=source.readUInt32BE(i),type=source.subarray(i+4,i+8).toString(),data=source.subarray(i+8,i+8+size);if(type==='IHDR')header=data;if(type==='IDAT')compressed.push(data);i+=size+12;}
 const pixels=inflateSync(Buffer.concat(compressed)),width=header.readUInt32BE(0),height=header.readUInt32BE(4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*(width*4+1)+1+x*4;if(pixels[i+3]){const r=pixels[i],g=pixels[i+1],b=pixels[i+2];pixels[i]=Math.min(255,g+24);pixels[i+1]=Math.max(0,Math.round(r*.75));pixels[i+2]=Math.min(255,b+38);}}
 await writeFile(pink+'/'+name,Buffer.concat([source.subarray(0,8),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]));
}
await writeFile(pink+'/character.json',JSON.stringify({schema_version:1,id:'builtin-momo',name:'桃桃',persona_text:'你是桃桃，一位轻快、温暖、有一点小幽默的桌面伙伴。用自然简短的话陪用户学习和工作，注意倾听，不催促，不说教。用户疲惫时先关心感受，再给一个很小的建议。',visual_type:'frames',asset_paths:{idle:['idle.png','blink.png'],walk:['walk-1.png','walk-2.png'],sleep:['blink.png'],click:['blink.png'],read:['idle.png']},supported_actions:['idle','walk','sleep','click','read'],fallback_action:'idle',frame_ms:{idle:850,walk:180},license:'MIT',source:'项目原创几何角色的樱花配色变体'},null,2));
