// Base comum dos testes de ponta a ponta (Playwright): servidor estático na raiz do repositório.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };

/** Sobe um servidor estático em porta livre de 127.0.0.1. Devolve o http.Server já escutando. */
function serve(root = ROOT) {
  const server = http.createServer((req, res) => {
    let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(data);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/**
 * Sem internet: com CDN_MIRROR=<pasta node_modules>, serve localmente os pacotes pedidos ao jsDelivr
 * (https://cdn.jsdelivr.net/npm/<pacote>@<versão>/<caminho>). A versão instalada precisa ser a mesma da página.
 */
async function mirrorCdn(context, mirror = process.env.CDN_MIRROR) {
  if (!mirror) return;
  await context.route(/^https:\/\/cdn\.jsdelivr\.net\/npm\//, route => {
    const m = route.request().url().match(/\/npm\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\/([^?#]+)/);
    if (!m) return route.fulfill({ status: 404, body: 'formato de URL não reconhecido' });
    const [, pacote, versao, resto] = m;
    const dir = path.join(mirror, pacote);
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    if (pkg.version !== versao) return route.fulfill({ status: 404, body: `espelho tem ${pacote}@${pkg.version}, página pede ${versao}` });
    const file = path.join(dir, resto);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'missing' });
    route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'text/javascript', body: fs.readFileSync(file), headers: { 'Access-Control-Allow-Origin': '*' } });
  });
}

module.exports = { ROOT, TYPES, serve, mirrorCdn };
