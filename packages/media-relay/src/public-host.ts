/** No node APIs: the edge independently checks discovered public destinations. */
export function publicIp(address:string):boolean {
 if (/^\d+\.\d+\.\d+\.\d+$/.test(address)) {
  const parts=address.split('.').map(Number);if(parts.some(part=>part>255))return false
  const [a,b,c]=parts as [number,number,number,number]
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0&&c===0||b===0&&c===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113)
 }
 if(!/^[0-9a-f:]+$/i.test(address)||address.split('::').length>2||/^:[^:]|[^:]:$/.test(address))return false
 const halves=address.toLowerCase().split('::'),left=halves[0]?.split(':').filter(Boolean)??[],right=halves[1]?.split(':').filter(Boolean)??[]
 if([...left,...right].some(part=>part.length>4)|| (halves.length===1?left.length!==8:left.length+right.length>=8))return false
 const words=[...left,...Array(halves.length===2?8-left.length-right.length:0).fill('0'),...right].map(part=>Number.parseInt(part,16))
 return (words[0]!&0xe000)===0x2000&&!(words[0]===0x2001&&(words[1]===0||words[1]===0xdb8))&&words[0]!==0x2002
}
export function createPublicHostCheck(dnsFetch:typeof fetch=fetch){
 const cache=new Map<string,number>()
 return async(host:string,signal:AbortSignal)=>{
  if((cache.get(host)??0)>Date.now())return
  const answers=await Promise.all(['A','AAAA'].map(async type=>{
   const r=await dnsFetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,{headers:{accept:'application/dns-json'},signal:AbortSignal.any([signal,AbortSignal.timeout(3000)])})
   if(!r.ok)throw new Error('Media DNS unavailable.')
   const text=await r.text();if(text.length>16384)throw new Error('Invalid DNS response.')
   const data=JSON.parse(text) as {Status?:number;Answer?:{type:number;data:string}[]}
   if(data.Status!==0||!Array.isArray(data.Answer??[])||(data.Answer?.length??0)>32)throw new Error('Invalid DNS response.')
   return (data.Answer??[]).filter(answer=>answer.type===1||answer.type===28).map(answer=>answer.data)
  }))
  const addresses=answers.flat();if(!addresses.length||addresses.some(address=>!publicIp(address)))throw new Error('Blocked discovered media address.')
  if(cache.size>=128)cache.delete(cache.keys().next().value!)
  cache.set(host,Date.now()+60000)
 }
}
