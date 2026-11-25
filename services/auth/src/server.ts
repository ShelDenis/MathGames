import { env } from './env'; // должен импортироваться первым: читает .env
import express from 'express';
import cors from 'cors';
import prisma from './db';
import authRoutes from './auth.routes';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);

// Health check: его спрашивают Gateway (/api/health/all) и npm run smoke
app.get(['/health', '/api/health'], async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', service: 'auth', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', service: 'auth', db: 'down' });
  }
});

const server = app.listen(env.PORT, () => {
  console.log(`✅ Auth Service запущен: http://localhost:${env.PORT}`);
});

// Аккуратное завершение (Ctrl+C или остановка контейнера)
const shutdown = async () => {
  console.log('Auth Service останавливается...');
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
