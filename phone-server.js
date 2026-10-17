// Предпросмотр на телефоне: раздаёт папку приложения по домашней сети Wi-Fi.
// Запуск: phone-preview.bat (или `node phone-server.js`). Телефон должен быть в той же сети Wi-Fi.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8'
};
// Наружу не отдаём служебное: зависимости, сборки, бэкенд, git
const HIDDEN = /^(node_modules|dist|backend|\.git|_backup)/i;

http.createServer((req, res) => {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');
  if (!rel) rel = 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || HIDDEN.test(rel)) { res.writeHead(403); return res.end('Нет доступа'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Не найдено'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  const ips = [];
  Object.values(os.networkInterfaces()).forEach(list => (list || []).forEach(a => {
    if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
  }));
  console.log('');
  console.log('  Предпросмотр на телефоне запущен.');
  console.log('  Открой на iPhone в Safari (телефон в той же сети Wi-Fi):');
  console.log('');
  ips.forEach(ip => console.log('      http://' + ip + ':' + PORT));
  if (!ips.length) console.log('      (не нашёл адрес в сети: проверь, что компьютер подключён к Wi-Fi или роутеру)');
  console.log('');
  console.log('  Чтобы остановить — закрой это окно.');
  console.log('');
});
