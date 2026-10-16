import {describe,it,expect,vi} from 'vitest'
import {publicIp,createPublicHostCheck} from './public-host.ts'
describe('discovered public DNS',()=>{
 it.each(['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','100.64.0.1','::1','fd00::1','2001:db8::1','::ffff:127.0.0.1'])('blocks %s',address=>expect(publicIp(address)).toBe(false))
 it.each(['1.1.1.1','8.8.8.8','2606:4700:4700::1111','2001:4860:4860::8888'])('accepts %s',address=>expect(publicIp(address)).toBe(true))
 it('rejects a mixed public/private DNS answer and caches only successful checks',async()=>{
  const dns=vi.fn<typeof fetch>(async()=>Response.json({Status:0,Answer:[{type:1,data:'1.1.1.1'},{type:1,data:'127.0.0.1'}]})),check=createPublicHostCheck(dns)
  await expect(check('media.example',new AbortController().signal)).rejects.toThrow('Blocked')
  dns.mockImplementation(async()=>Response.json({Status:0,Answer:[{type:1,data:'1.1.1.1'}]}))
  await check('media.example',new AbortController().signal);await check('media.example',new AbortController().signal)
  expect(dns).toHaveBeenCalledTimes(4)
 })
})
