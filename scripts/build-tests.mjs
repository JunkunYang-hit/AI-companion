import { build } from 'esbuild';
import { readdir, mkdir } from 'node:fs/promises';
await mkdir('dist-tests',{recursive:true});
for (const name of (await readdir('tests')).filter(n=>n.endsWith('.test.ts'))) {
  await build({entryPoints:[`tests/${name}`],bundle:true,platform:'node',format:'cjs',outfile:`dist-tests/${name.replace('.ts','.cjs')}`,external:['sql.js','koffi','electron']});
}
