// Offline integration harness: compile application TypeScript and replace only platform bindings.
import {pathToFileURL,fileURLToPath} from 'node:url';import fs from 'node:fs';
const ts=(await import(process.env.TYPESCRIPT_COMPILER||'typescript')).default;
const root=process.cwd();
export async function resolve(specifier,context,next){
 if(['cloudflare:workers'].includes(specifier))return {url:pathToFileURL(root+'/test/platform.mjs').href,shortCircuit:true};
 let p;if(specifier.startsWith('@/'))p=root+'/'+specifier.slice(2);else if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:'))p=fileURLToPath(new URL(specifier,context.parentURL));
 if(p){for(const ext of ['', '.ts','.tsx','/index.ts'])if(fs.existsSync(p+ext)&&fs.statSync(p+ext).isFile())return {url:pathToFileURL(p+ext).href,shortCircuit:true};}
 return next(specifier,context);
}
export async function load(url,context,next){if(url.endsWith('.ts')||url.endsWith('.tsx')){const code=fs.readFileSync(fileURLToPath(url),'utf8');return {format:'module',shortCircuit:true,source:ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText};}return next(url,context);}
