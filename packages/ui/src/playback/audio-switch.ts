/** Persist language intent only after the engine confirms buffered audio and the media clock advances. */
export function createAudioSwitch(video: HTMLVideoElement) {
  let cancel: (() => void) | undefined
  return {
    async select(apply: () => void, restore: () => void, buffered: (ready: () => void) => () => void = ready => { ready(); return () => {} }): Promise<boolean> {
      cancel?.()
      return new Promise(resolve => {
        let ready = false, finished = false
        const start = video.currentTime
        let detach = () => {}
        const finish = (success: boolean) => {
          if (finished) return
          finished = true; clearTimeout(timer); detach()
          video.removeEventListener('timeupdate', check); video.removeEventListener('canplay', check); video.removeEventListener('error', fail)
          if (!success) restore()
          cancel = undefined; resolve(success)
        }
        const check = () => { if (ready && video.readyState >= 3 && (video.paused || video.currentTime > start)) finish(true) }
        const fail = () => finish(false)
        const timer = setTimeout(fail, 8000)
        cancel = fail
        video.addEventListener('timeupdate', check); video.addEventListener('canplay', check); video.addEventListener('error', fail)
        detach = buffered(() => { ready = true; queueMicrotask(check) })
        try { apply() } catch { fail() }
      })
    },
    dispose() { cancel?.() },
    pending() { return Boolean(cancel) },
    fail() { cancel?.() },
  }
}
