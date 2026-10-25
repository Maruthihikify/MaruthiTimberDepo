# Brand emblem

The logo is rendered, not drawn: a cast-brass gada (Hanuman's mace — Maruthi is Hanuman) with a saffron cloth grip
and a sindoor tilak, set on a sawn teak log end (procedural growth rings, sapwood, drying checks, saw marks) with the
CC0 bark scan from `public/landing/textures/bark_diff.webp` around the rim.

To re-render after editing `render.html`:

```bash
node scripts/brand/server.mjs scripts/brand public/landing/textures public/brand
# open http://127.0.0.1:5399, check it, then run  saveAll()  in the browser console
```

Outputs in `public/brand/`: `logo-1024.webp`, `logo-512.webp`, `logo-256.webp`, `icon-192.png`,
`apple-touch-icon.png`, `favicon-64.png`, `favicon-32.png`.
