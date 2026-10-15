import {readFileSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

// Prepare a private proposal; installing it and enabling providers are separate
// operator actions. Existing Direct rows, overrides and ordering are retained.
const ids=['vidapiframe','vidfastframe','vidcoreioframe','vidriftframe','moviesapiframe','vidlinkframe','vidnestframe']
const args=process.argv.slice(2),values={}
if(args.includes('--help')){
 console.log('node scripts/prepare-frame-servers.mjs --input PATH --output NEW_PATH --region US\nAppends missing disabled frame recipes. Existing rows are preserved. Does not deploy or enable providers.')
 process.exit(0)
}
for(let index=0;index<args.length;index+=2){
 const key=args[index],value=args[index+1]
 if(!['--input','--output','--region'].includes(key)||!value||value.startsWith('--')||key in values)throw Error('Use --input PATH --output NEW_PATH --region XX')
 values[key]=value
}
if(!values['--input']||!values['--output']||!/^[A-Z]{2}$/.test(values['--region']??''))throw Error('Provide input, new output path and an explicit two-letter serving region')
const input=resolve(values['--input']),output=resolve(values['--output'])
if(input===output)throw Error('Output must be a new proposal file, not the active input')
const raw=readFileSync(input,'utf8')
if(raw.length>2_000_000)throw Error('Provider configuration exceeds its size limit')
const rows=JSON.parse(raw)
if(!Array.isArray(rows)||rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string')||new Set(rows.map(row=>row.id)).size!==rows.length)throw Error('Input must contain distinct configured provider rows')
const recipes=JSON.parse(readFileSync(fileURLToPath(new URL('../infra/playback/providers.example.json',import.meta.url)),'utf8'))
const added=[],existing=[]
for(const id of ids){
 const recipe=recipes.find(row=>row.id===id)
 if(!recipe||recipe.adapter!==id||recipe.deliveryMode!=='embed'||recipe.mediaHosts?.length!==1)throw Error('Missing reviewed frame recipe: '+id)
 const current=rows.find(row=>row.id===id)
 if(current){
  if(current.adapter!==id||current.deliveryMode!=='embed'||JSON.stringify(current.mediaHosts)!==JSON.stringify(recipe.mediaHosts)||(current.mediaHostPatterns?.length??0)>0)throw Error('Existing frame row conflicts with reviewed origin: '+id)
  existing.push(id);continue
 }
 rows.push({...recipe,enabled:false,regions:[values['--region']]});added.push(id)
}
if(rows.length>64)throw Error('Proposal exceeds the current 64-row configuration limit; review the roster before installation')
const proposal=JSON.stringify(rows,null,2)+'\n'
if(proposal.length>2_000_000)throw Error('Proposal exceeds the provider configuration size limit')
writeFileSync(output,proposal,{mode:0o600,flag:'wx'})
console.log(JSON.stringify({proposal:output,addedDisabledFrames:added,existingFramesPreserved:existing,totalRows:rows.length,deployed:false}))
