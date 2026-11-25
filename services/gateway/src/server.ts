import { config } from './config'; // первым: читает .env
import express from 'express';
import cors from 'cors';
import http from 'http';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { roundRobin, Balancer } from './balancer';
import { authenticate, requestLogger } from './middleware';

const app = express();
app.disable('x-powered-by');

// ВАЖНО: express.json() здесь не подключаем: Gateway не читает тело запроса,
// а передаёт его сервисам как есть (иначе загрузка файлов сломается).
app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') }));
app.use(requestLogger);

// ---------- Health check ----------
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gateway', timestamp: new Date().toISOString() });
});

// Сводка по всем сервисам (удобно для проверки и мониторинга)
const downstream = [
  { name: 'auth', url: config.authUrl },
  ...config.coreUrls.map((url) => ({ name: 'core', url })),
  ...config.imageWorkerUrls.map((url) => ({ name: 'image-worker', url })),
];

app.get('/api/health/all', async (_req, res) => {
  const services = await Promise.all(
    downstream.map(async ({ name, url }) => {
      try {
        const r = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) });
        return { name, url, ok: r.ok };
      } catch {
        return { name, url, ok: false };
      }
    }),
  );
  const allOk = services.every((s) => s.ok);
  res.status(allOk ? 200 : 503).json({ status: allOk ? 'ok' : 'degraded', services });
});

// ---------- Проверка JWT ----------
app.use(authenticate);

// ---------- Проксирование ----------
const onError =
  (service: string, balancer?: Balancer) =>
  (err: Error, _req: unknown, res: unknown, target?: unknown) => {
    console.error(`[proxy:${service}] ${err.message}`);
    if (balancer && target) balancer.markDown(target); // адрес на 10 секунд в карантин
    const response = res as http.ServerResponse;
    if (typeof response.writeHead === 'function' && !response.headersSent) {
      response.writeHead(502, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: `Сервис «${service}» недоступен` }));
    }
  };

const imageBalancer = roundRobin(config.imageWorkerUrls);
const coreBalancer = roundRobin(config.coreUrls);

// 1) Авторизация -> Auth Service
const authProxy = createProxyMiddleware({
  target: config.authUrl,
  pathFilter: '/api/auth',
  changeOrigin: true,
  on: { error: onError('auth') },
});

// 2) Загрузка фото и сами файлы -> Image Worker (по кругу)
const imageProxy = createProxyMiddleware({
  target: config.imageWorkerUrls[0],
  router: () => imageBalancer.next(),
  pathFilter: (path) => path.startsWith('/api/upload') || path.startsWith('/uploads'),
  changeOrigin: true,
  on: { error: onError('image-worker', imageBalancer) },
});

// 3) Socket.IO (в том числе WebSocket) -> Image Worker (всегда первый адрес)
const socketProxy = createProxyMiddleware({
  target: config.imageWorkerUrls[0],
  pathFilter: '/socket.io',
  ws: true,
  changeOrigin: true,
  on: { error: onError('image-worker') },
});

// 4) Всё остальное под /api -> Core Service (по кругу)
const coreProxy = createProxyMiddleware({
  target: config.coreUrls[0],
  router: () => coreBalancer.next(),
  pathFilter: '/api',
  changeOrigin: true,
  on: { error: onError('core', coreBalancer) },
});

app.use(authProxy);
app.use(imageProxy);
app.use(socketProxy);
app.use(coreProxy);

app.use((_req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

const server = http.createServer(app);
// Без этой строки WebSocket-соединения Socket.IO не пройдут через Gateway
server.on('upgrade', socketProxy.upgrade!);

server.listen(config.port, () => {
  console.log(`✅ API Gateway запущен: http://localhost:${config.port}`);
  console.log(`   auth         -> ${config.authUrl}`);
  console.log(`   core         -> ${config.coreUrls.join(', ')}`);
  console.log(`   image-worker -> ${config.imageWorkerUrls.join(', ')}`);
});

const shutdown = () => {
  console.log('Gateway останавливается...');
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
