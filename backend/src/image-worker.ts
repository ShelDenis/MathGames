
import express from 'express';
import cors from 'cors';
import http from 'http';
// import dotenv from 'dotenv';
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import IORedis from 'ioredis';
import { Worker } from 'bullmq';

import { initSocket } from './config/socket';
import { processImage } from './services/image.service';
import uploadRoutes from './routes/upload.routes';

// dotenv.config();

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use('/uploads', express.static(uploadDir));
app.use('/api/upload', uploadRoutes);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'image-worker',
    timestamp: new Date().toISOString()
  });
});

initSocket(server);

const connection = new IORedis(
  process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  { maxRetriesPerRequest: null }
);

const worker = new Worker(
  'image-processing',
  async (job) => {
    console.log(`Обрабатываем изображение ${job.data.imageId}`);

    await processImage(job.data.imageId, job.data.filePath);

    return { imageId: job.data.imageId, status: 'processed' };
  },
  {
    connection,
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5)
  }
);

worker.on('completed', (job) => {
  console.log(`Задача ${job.id} завершена`);
});

worker.on('failed', (job, error) => {
  console.error(`Ошибка задачи ${job?.id}:`, error.message);
});

const PORT = Number(process.env.IMAGE_WORKER_PORT ?? 3004);

server.listen(PORT, () => {
  console.log(`Image Worker запущен: http://localhost:${PORT}`);
});

async function shutdown() {
  await worker.close();
  await connection.quit();
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
