import { readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const mediaDirectory = new URL('./media/', import.meta.url)
const segmentNames = (await readdir(mediaDirectory)).filter(name => /^segment-\d{2}\.ts$/.test(name)).sort()
const transport = Buffer.concat(await Promise.all(segmentNames.map(name => readFile(new URL(name, mediaDirectory)))))
const packetSize = 188

function payload(packet: Buffer) {
  if (packet[0] !== 0x47) return null
  const control = (packet[3]! >> 4) & 0x03
  if (control === 0 || control === 2) return null
  const offset = control === 3 ? 5 + packet[4]! : 4
  return offset < packetSize ? packet.subarray(offset) : null
}

function section(bytes: Buffer) {
  const pointer = bytes[0] ?? 0
  return bytes.subarray(pointer + 1)
}

let pmtPid: number | undefined
let audioPid: number | undefined
for (let offset = 0; offset + packetSize <= transport.length; offset += packetSize) {
  const packet = transport.subarray(offset, offset + packetSize)
  const pid = ((packet[1]! & 0x1f) << 8) | packet[2]!
  const start = (packet[1]! & 0x40) !== 0
  const data = payload(packet)
  if (!data || !start || pid !== 0 || pmtPid !== undefined) continue
  const pat = section(data)
  for (let index = 8; index + 4 <= pat.length - 4; index += 4) {
    const program = (pat[index]! << 8) | pat[index + 1]!
    if (program) { pmtPid = ((pat[index + 2]! & 0x1f) << 8) | pat[index + 3]!; break }
  }
}
if (pmtPid === undefined) throw new Error('The playback fixture has no MPEG-TS program map.')

for (let offset = 0; offset + packetSize <= transport.length; offset += packetSize) {
  const packet = transport.subarray(offset, offset + packetSize)
  const pid = ((packet[1]! & 0x1f) << 8) | packet[2]!
  const data = payload(packet)
  if (!data || pid !== pmtPid || (packet[1]! & 0x40) === 0) continue
  const pmt = section(data)
  const programInfoLength = ((pmt[10]! & 0x0f) << 8) | pmt[11]!
  for (let index = 12 + programInfoLength; index + 5 <= pmt.length - 4;) {
    const type = pmt[index]!
    const streamPid = ((pmt[index + 1]! & 0x1f) << 8) | pmt[index + 2]!
    const infoLength = ((pmt[index + 3]! & 0x0f) << 8) | pmt[index + 4]!
    if (type === 0x0f) { audioPid = streamPid; break }
    index += 5 + infoLength
  }
  if (audioPid !== undefined) break
}
if (audioPid === undefined) throw new Error('The playback fixture has no ADTS AAC stream.')

const elementary: Buffer[] = []
for (let offset = 0; offset + packetSize <= transport.length; offset += packetSize) {
  const packet = transport.subarray(offset, offset + packetSize)
  const pid = ((packet[1]! & 0x1f) << 8) | packet[2]!
  if (pid !== audioPid) continue
  const data = payload(packet)
  if (!data) continue
  if ((packet[1]! & 0x40) !== 0) {
    if (data.length < 9 || data[0] !== 0 || data[1] !== 0 || data[2] !== 1) continue
    const headerLength = 9 + data[8]!
    elementary.push(data.subarray(headerLength))
  } else elementary.push(data)
}

const bytes = Buffer.concat(elementary)
const frames: Buffer[] = []
for (let offset = 0; offset + 7 <= bytes.length;) {
  if (bytes[offset] !== 0xff || (bytes[offset + 1]! & 0xf6) !== 0xf0) { offset++; continue }
  const length = ((bytes[offset + 3]! & 0x03) << 11) | (bytes[offset + 4]! << 3) | ((bytes[offset + 5]! & 0xe0) >> 5)
  const headerLength = (bytes[offset + 1]! & 1) === 0 ? 9 : 7
  if (length < headerLength || offset + length > bytes.length) { offset++; continue }
  frames.push(bytes.subarray(offset, offset + length))
  offset += length
}
if (frames.length < 100) throw new Error(`Expected a usable AAC fixture; found only ${frames.length} frames.`)

const output = new URL('./media/audio.aac', import.meta.url)
await writeFile(output, Buffer.concat(frames))
process.stdout.write(`Wrote ${frames.length} AAC frames (${fileURLToPath(output)}).\n`)
