import {allowedMediaUrl,type ProviderSource} from '../index.ts'
import {assertHlsManifest} from '../manifest.ts'
import type {ProviderHttp} from './http.ts'

export type RelayRecipe = 'storm-boron-v1' | 'wecollege-city-v1'
export function discoveryHost(value:string) {
  const url=new URL(value),host=url.hostname
  if(!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host)||/^\d+(?:\.\d+){3}$/.test(host)
    ||/\.(?:local|internal|localhost|test|invalid|workers\.dev|pages\.dev)$/.test(host)
    ||!allowedMediaUrl(value,[host])||value.length>1800)throw new Error('Unsafe discovered media destination.')
  return host
}
/** Discover only the bounded graph supplied by a configured adapter. The
 * API's mediaScope transport checks and pins public DNS on every socket. */
export async function discoverRelaySource(source:ProviderSource,http:ProviderHttp,recipe:RelayRecipe,signal:AbortSignal,rootManifest?:string):Promise<ProviderSource>{
 if(!http.mediaScope)throw new Error('Relay discovery is not configured.')
 const hosts=new Set<string>([discoveryHost(source.url)]),visited=new Set<string>(),checked=new Set<string>()
 if(source.type==='native'){
  const response=await http.mediaScope([...hosts])(source.url,source.headers,signal,{readPrefixBytes:1024})
  if(![200,206].includes(response.status)||response.url!==source.url||!response.bytes?.length||/text\/|application\/(?:json|javascript)/i.test(response.headers?.get('content-type')??''))throw new Error('Invalid native media.')
  return {...source,relayRecipe:recipe,relayHosts:[...hosts]}
 }
 if(source.type!=='hls')throw new Error('Unsupported relay discovery format.')
 async function manifest(url:string,depth:number,text?:string){
  if(visited.has(url))return
  if(depth>3||visited.size>=8)throw new Error('Relay discovery graph exceeds its limit.')
  visited.add(url)
  const scoped=http.mediaScope!([...hosts])
  if(text===undefined){const r=await scoped(url,source.headers,signal);if(r.status!==200)throw new Error('Unavailable media manifest.');text=r.text;if(r.url!==url)throw new Error('Unreviewed media redirect.')}
  assertHlsManifest(text)
  const references:{url:string;playlist:boolean}[]=[];let nextPlaylist=false
  for(const line of text.split(/\r?\n/)){
   if(line.trim()&&!line.startsWith('#')){references.push({url:new URL(line.trim(),url).href,playlist:nextPlaylist});nextPlaylist=false}
   if(line.startsWith('#EXT-X-STREAM-INF:'))nextPlaylist=true
   for(const match of line.matchAll(/\bURI="([^"]*)"/g))references.push({url:new URL(match[1]!,url).href,playlist:/^#EXT-X-(?:MEDIA|I-FRAME-STREAM-INF|RENDITION-REPORT):/.test(line)})
  }
  if(references.length>2000)throw new Error('Too many media references.')
  for(const reference of references){const host=discoveryHost(reference.url);hosts.add(host);if(hosts.size>8)throw new Error('Too many discovered hosts.')}
  const media=http.mediaScope!([...hosts])
  for(const reference of references){
   if(reference.playlist){await manifest(reference.url,depth+1);continue}
   const host=discoveryHost(reference.url)
   if(checked.has(host))continue
   const response=await media(reference.url,source.headers,signal,{readPrefixBytes:1024})
   if(![200,206].includes(response.status)||response.url!==reference.url)throw new Error('Unavailable media reference.')
   const bytes=response.bytes??new TextEncoder().encode(response.text),type=response.headers?.get('content-type')??''
   const ts=bytes[0]===71&&bytes[188]===71&&bytes[376]===71
   if(!bytes.length||/^\s*(?:<!doctype|<html|<script)/i.test(new TextDecoder().decode(bytes.subarray(0,64)))||(/text\/html|application\/(?:json|javascript)/i.test(type)&&!(recipe==='storm-boron-v1'&&ts)))throw new Error('Invalid media reference.')
   checked.add(host)
  }
 }
 await manifest(source.url,0,rootManifest)
 return {...source,relayRecipe:recipe,relayHosts:[...hosts]}
}
