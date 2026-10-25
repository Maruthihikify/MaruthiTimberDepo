# Hero video clips

Drop the clips for the opening scroll story here. The website checks for each file on load and uses it
when present; any clip that is missing falls back to a realistic still made from real wood textures, so the
page always works.

| Chapter | Landscape file (16:9) | Portrait file for phones (9:16, optional) | Poster (optional) | What it shows |
| --- | --- | --- | --- | --- |
| 1 · Opening | `hero.mp4` | `hero-portrait.mp4` | `hero.jpg` | Golden-hour teak logs in the yard, slow push-in on the log ends |
| 2 · Sawmill | `saw.mp4` | `saw-portrait.mp4` | `saw.jpg` | A circular saw slicing a teak log, sawdust glowing in a light beam |
| 3 · Grain | `grain.mp4` | `grain-portrait.mp4` | `grain.jpg` | Macro of a fresh-cut teak plank, a light sweep across the grain |
| 4 · Seasoning | `yard.mp4` | `yard-portrait.mp4` | `yard.jpg` | Stickered seasoning stacks, drone pull-back over the yard |
| 5 · The door | `door.mp4` | `door-portrait.mp4` | `door.jpg` | A finished panelled teak door being polished, varnish catching light |

**Format**

- MP4 (H.264), 1920×1080 for landscape, 1080×1920 for portrait, about **8 seconds**, made to **loop** cleanly.
- **No audio track needed** — clips always play muted (browsers only autoplay muted video).
- Keep each file around **3–6 MB** (CRF ~23–26). Smaller files start faster on mobile data.
- Posters are JPG frames from the clip at the same size (shown while the clip loads).

**Loading**: only `hero.mp4` loads with the page; each later clip starts loading when the visitor scrolls
near its chapter, and clips that are off-screen are paused.
