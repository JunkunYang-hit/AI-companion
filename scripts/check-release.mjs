import {readFileSync,readdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {listPackage,extractFile} from '@electron/asar';
const allowed=['app-icon.ico','app-icon.png','app-icon.svg','characters/momo/blink.png','characters/momo/character.json','characters/momo/idle.png','characters/momo/walk-1.png','characters/momo/walk-2.png','default-character/blink.png','default-character/character.json','default-character/icon.ico','default-character/idle.png','default-character/walk-1.png','default-character/walk-2.png'].sort();
const files=(directory,prefix='')=>readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(directory,e.name),prefix+e.name+'/'):[prefix+e.name]);
assert.deepEqual(files('assets').sort(),allowed,'公开资产必须仅包含原创角色与图标');
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
assert(!Object.keys(lock.packages).some(p=>/pixi-live2d-display|node_modules\/pixi\.js|node_modules\/@pixi\//.test(p)),'不能带入Live2D显示依赖');
for(const folder of ['default-character','characters/momo'])assert.equal(JSON.parse(readFileSync('assets/'+folder+'/character.json','utf8')).license,'MIT');
const asar=process.argv[2];
if(asar){assert(existsSync(asar));const names=listPackage(asar).map(p=>p.replaceAll('\\','/').replace(/^\//,''));assert.deepEqual(names.filter(p=>p.startsWith('assets/')&&/\.[^/]+$/.test(p)).map(p=>p.slice(7)).sort(),allowed);assert(!names.some(p=>/live2dcubismcore|\.moc3$|pixi-live2d|credentials|\.dpapi$|\.db$|http-cache-semantics|node_modules\/got\//i.test(p)));assert(!extractFile(asar,'dist/renderer.js').toString().includes('Live2DCubismCore'));}
console.log('PASS: original-only public asset allowlist, no Live2D runtime/dependencies; '+(asar?'packaged application checked.':'source checked.'));
