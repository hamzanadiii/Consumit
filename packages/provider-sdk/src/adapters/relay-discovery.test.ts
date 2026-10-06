import {describe,it,expect,vi} from 'vitest'
import {discoverRelaySource} from './relay-discovery.ts'
import type {ProviderHttp} from './http.ts'
const source={key:'city',url:'https://moon.zenoak.top/vod/title.m3u8',type:'hls' as const,language:'original',headers:{referer:'https://movy.sx/'},expiresAt:'2099-01-01T00:00:00Z',subtitles:[]}
describe('provider-scoped media discovery',()=>{
 it.each(['proudhawk.top','next-title-cdn.example'])('leases verified per-title hosts without a title-specific list (%s)',async host=>{
  const bytes=new Uint8Array(564);bytes[0]=bytes[188]=bytes[376]=71
  const http=Object.assign(vi.fn<ProviderHttp>(async url=>url.endsWith('.m3u8')?{status:200,url,text:`#EXTM3U\n#EXTINF:6,\nhttps://${host}/part.ts\n`}:{status:200,url,text:'',bytes,headers:new Headers({'content-type':'video/mp2t'})}),{mediaScope:()=>http})
  const result=await discoverRelaySource(source,http,'wecollege-city-v1',new AbortController().signal)
  expect(result.relayHosts).toEqual(['moon.zenoak.top',host])
  expect(result.relayRecipe).toBe('wecollege-city-v1')
 })
 it.each(['http://public.example/a.ts','https://127.0.0.1/a.ts','https://metadata.internal/a.ts','https://user:pass@public.example/a.ts'])('rejects unsafe discovered references (%s)',async url=>{
  const http=Object.assign(vi.fn<ProviderHttp>(async value=>({status:200,url:value,text:`#EXTM3U\n#EXTINF:6,\n${url}\n`})),{mediaScope:()=>http})
  await expect(discoverRelaySource(source,http,'wecollege-city-v1',new AbortController().signal)).rejects.toThrow()
 })
 it('does not enable discovery on an ordinary HTTP adapter',async()=>{
  await expect(discoverRelaySource(source,vi.fn<ProviderHttp>(), 'wecollege-city-v1',new AbortController().signal)).rejects.toThrow()
 })
 it('rejects a playlist that expands beyond the finite host scope',async()=>{
  const text='#EXTM3U\n'+Array.from({length:8},(_,i)=>`#EXTINF:6,\nhttps://host${i}.example/part.ts\n`).join('')
  const http=Object.assign(vi.fn<ProviderHttp>(async url=>({status:200,url,text})),{mediaScope:()=>http})
  await expect(discoverRelaySource(source,http,'wecollege-city-v1',new AbortController().signal)).rejects.toThrow('Too many discovered hosts')
  expect(http).toHaveBeenCalledTimes(1)
 })
 it('rejects excessive nesting and actual HTML instead of leasing its host',async()=>{
  const http=Object.assign(vi.fn<ProviderHttp>(async url=>({status:200,url,text:`#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\n${Number(url.match(/(\d+)\.m3u8/)?.[1]??0)+1}.m3u8\n`})),{mediaScope:()=>http})
  await expect(discoverRelaySource(source,http,'wecollege-city-v1',new AbortController().signal)).rejects.toThrow('graph exceeds')
  http.mockImplementation(async url=>({status:200,url,text:url.endsWith('.m3u8')?'#EXTM3U\n#EXTINF:6,\npart.ts\n':'<html>Unavailable</html>',headers:new Headers({'content-type':'text/html'})}))
  await expect(discoverRelaySource(source,http,'wecollege-city-v1',new AbortController().signal)).rejects.toThrow('Invalid media reference')
 })
})
