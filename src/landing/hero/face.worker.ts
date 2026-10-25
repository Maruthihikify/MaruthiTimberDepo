// Generates log end-grain faces off the main thread so scrolling never stutters.
import { logFacePixels, type LogFaceOptions } from './procedural'

self.onmessage = (e: MessageEvent<{ id: number; opts: LogFaceOptions }>) => {
  const { id, opts } = e.data
  const px = logFacePixels(opts)
  ;(self as unknown as Worker).postMessage({ id, size: px.size, color: px.color }, [px.color.buffer])
}
