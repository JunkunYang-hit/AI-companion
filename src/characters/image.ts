export function inspectImage(bytes:Uint8Array){
 const b=Buffer.from(bytes);if(b.length>8*1024*1024||b.length<24)throw new Error('图片最多8 MB，请选择有效的PNG、GIF或WebP。');
 let width=0,height=0,mime='',extension='';
 if(b.subarray(0,8).toString('hex')==='89504e470d0a1a0a'){width=b.readUInt32BE(16);height=b.readUInt32BE(20);mime='image/png';extension='png';}
 else if(/^GIF8[79]a$/.test(b.subarray(0,6).toString())){width=b.readUInt16LE(6);height=b.readUInt16LE(8);mime='image/gif';extension='gif';}
 else if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'){
  mime='image/webp';extension='webp';const kind=b.subarray(12,16).toString();
  if(kind==='VP8X'&&b.length>=30){width=1+b.readUIntLE(24,3);height=1+b.readUIntLE(27,3);}
  else if(kind==='VP8L'&&b.length>=25){const bits=b.readUInt32LE(21);width=1+(bits&0x3fff);height=1+((bits>>>14)&0x3fff);}
  else if(kind==='VP8 '&&b.length>=30){width=b.readUInt16LE(26)&0x3fff;height=b.readUInt16LE(28)&0x3fff;}
 }
 if(!mime||width<1||height<1||width>4096||height>4096)throw new Error('请选择4096×4096以内的PNG、GIF或WebP图片。');
 return {width,height,mime,extension};
}
