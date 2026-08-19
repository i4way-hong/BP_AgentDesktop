// Simple static server for BP_AgentDesktop
// Usage: node server.js
// Serves this folder on http://localhost:8080

const http = require('http')
const fs = require('fs')
const path = require('path')

const host = '127.0.0.1'
const port = 8080
const root = __dirname

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

function send(res, code, data, headers={}) {
  res.writeHead(code, { 'Cache-Control': 'no-cache', ...headers })
  res.end(data)
}

const server = http.createServer((req, res) => {
  try {
    let reqPath = decodeURI(req.url.split('?')[0])
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html'
    const filePath = path.join(root, reqPath)
    if (!filePath.startsWith(root)) return send(res, 403, 'Forbidden')
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        return send(res, 404, 'Not Found')
      }
      const ext = path.extname(filePath).toLowerCase()
      const type = MIME[ext] || 'application/octet-stream'
      fs.readFile(filePath, (e, buf) => {
        if (e) return send(res, 500, 'Server Error')
        send(res, 200, buf, { 'Content-Type': type })
      })
    })
  } catch (e) {
    send(res, 500, 'Server Error')
  }
})

server.listen(port, host, () => {
  console.log(`BP_AgentDesktop server running at http://${host}:${port}`)
})
