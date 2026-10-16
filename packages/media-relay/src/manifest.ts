import {mediaGrantUrl,manifestGrantUrl,relayDestination,type RelayGrant,type GrantCodec} from './grants.ts'

/** Shared control-document compilation. Video/key/map bytes stay at the edge. */
export async function rewriteRelayManifest(text:string,base:string,grant:RelayGrant,hosts:string[],codec:GrantCodec,origin:string,now:number,playlistOrigin?:string){
 if(!text.startsWith('#EXTM3U')||grant.depth>=5||/#EXT-X-(?:DEFINE|CONTENT-STEERING)\b|\{\$/.test(text))throw new Error('Unsupported manifest.')
 const references:{uri:string;playlist:boolean}[]=[];let nextPlaylist=false
 const replaced=text.split(/\r?\n/).map(line=>{
  if(line.trim()&&!line.startsWith('#')){references.push({uri:line.trim(),playlist:nextPlaylist});nextPlaylist=false;return `__CONSUMIT_${references.length-1}__`}
  if(line.startsWith('#EXT-X-STREAM-INF:'))nextPlaylist=true
  return line.replace(/\bURI="([^"]*)"/g,(_match,uri:string)=>{references.push({uri,playlist:/^#EXT-X-(?:MEDIA|I-FRAME-STREAM-INF|RENDITION-REPORT):/.test(line)});return `URI="__CONSUMIT_${references.length-1}__"`})
 }).join('\n')
 if(references.length>(grant.provider==='rigel'?6000:2000)||/__CONSUMIT_/.test(text))throw new Error('Invalid manifest.')
 const urls=references.map(ref=>new URL(ref.uri,base).href)
 if(urls.some(url=>!relayDestination(url,hosts)))throw new Error('Blocked manifest destination.')
 const tokens=await Promise.all(urls.map((url,index)=>codec.seal({...grant,url,kind:references[index]!.playlist?'hls':'auto',depth:grant.depth+1,...(grant.recipe&&!references[index]!.playlist?{hosts:[new URL(url).hostname]}:{})},now)))
 return replaced.replace(/__CONSUMIT_(\d+)__/g,(_match,index:string)=>playlistOrigin&&references[Number(index)]!.playlist?manifestGrantUrl(playlistOrigin,tokens[Number(index)]!):mediaGrantUrl(origin,tokens[Number(index)]!))
}
