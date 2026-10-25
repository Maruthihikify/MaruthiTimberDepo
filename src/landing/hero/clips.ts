// The five hero chapters and the video clips that back them (see public/landing/video/README.md).

export type ClipKey = 'hero' | 'saw' | 'grain' | 'yard' | 'door'
export const CLIP_KEYS: ClipKey[] = ['hero', 'saw', 'grain', 'yard', 'door']
export const RAIL_LABELS = ['Opening', 'Sawmill', 'Grain', 'Seasoning', 'Craft']

export interface ClipSource {
  video: string | null
  poster: string | null
}

const base = `${import.meta.env.BASE_URL}landing/video/`

/**
 * True when the server really has the file. Static hosts and the dev server answer unknown paths with
 * the HTML app shell (200 text/html), so the content type is checked, not just the status.
 */
async function exists(url: string, kind: 'video' | 'image'): Promise<boolean> {
  const ok = (r: Response) => (r.ok || r.status === 206) && (r.headers.get('content-type') ?? '').startsWith(`${kind}/`)
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-cache' })
    if (r.status === 405 || r.status === 501) {
      const g = await fetch(url, { headers: { Range: 'bytes=0-1' }, cache: 'no-cache' })
      return ok(g)
    }
    return ok(r)
  } catch {
    return false
  }
}

async function first(names: string[], kind: 'video' | 'image') {
  for (const n of names) if (await exists(base + n, kind)) return base + n
  return null
}

/** Finds the best available clip and poster for a chapter (portrait files first on tall screens). */
export async function resolveClip(key: ClipKey, portrait: boolean): Promise<ClipSource> {
  const v = portrait ? [`${key}-portrait.mp4`, `${key}.mp4`] : [`${key}.mp4`]
  const video = await first(v, 'video')
  const posterNames = video?.includes('-portrait') ? [`${key}-portrait.jpg`, `${key}.jpg`] : [`${key}.jpg`]
  const poster = video ? await first(posterNames, 'image') : null
  return { video, poster }
}
