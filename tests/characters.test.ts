import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectImage} from '../src/characters/image';
import {validateCharacter} from '../src/characters/package';
test('built-in character formats and action timings validate',()=>{
 for(const folder of ['assets/default-character','assets/characters/momo']){
  const pack=validateCharacter(JSON.parse(readFileSync(folder+'/character.json','utf8')));
  for(const file of Object.values(pack.asset_paths).flat()){const image=inspectImage(readFileSync(folder+'/'+file));assert(image.width>0&&image.height>0);assert(['image/png','image/gif','image/webp'].includes(image.mime));}
 }
 const sample=JSON.parse(readFileSync('assets/characters/momo/character.json','utf8'));assert.throws(()=>validateCharacter({...sample,frame_ms:{idle:1}}));assert.throws(()=>inspectImage(new Uint8Array(40)));assert.throws(()=>inspectImage(new Uint8Array(9*1024*1024)));
});
