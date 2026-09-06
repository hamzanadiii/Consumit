// hls.js ships its own types; only dashjs needs an ambient declaration here.
declare module 'dashjs' {
  export type DashPlayer = {
    initialize(video: HTMLVideoElement, src: string, autoPlay: boolean): void
    reset(): void
  }
  export function MediaPlayer(): { create(): DashPlayer }
  const dashjs: { MediaPlayer(): { create(): DashPlayer } }
  export default dashjs
}
