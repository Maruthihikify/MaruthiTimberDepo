// Tiny local helper: serves the logo renderer and saves the PNG/WebP files it posts back.
// node server.mjs <dir-with-render.html> <textures-dir> <output-dir>
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const [ROOT, TEX, OUT] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const types = { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.js': 'text/javascript' }

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost')
  if (req.method === 'GET') {
    const file = u.pathname === '/' ? path.join(ROOT, 'render.html')
      : u.pathname.startsWith('/tex/') ? path.join(TEX, path.basename(u.pathname))
      : u.pathname.startsWith('/out/') ? path.join(OUT, path.basename(u.pathname)) : null
    if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found') }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
    return fs.createReadStream(file).pipe(res)
  }
  if (req.method === 'POST' && u.pathname === '/save') {
    const name = u.searchParams.get('name') ?? ''
    if (!/^[a-z0-9._-]+\.(png|webp)$/.test(name)) { res.writeHead(400); return res.end('bad name') }
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const buf = Buffer.concat(chunks)
      fs.writeFileSync(path.join(OUT, name), buf)
      console.log('saved', name, buf.length, 'bytes')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, name, bytes: buf.length }))
    })
    return
  }
  res.writeHead(405); res.end()
}).listen(5399, '127.0.0.1', () => console.log('logo renderer on http://127.0.0.1:5399'))
