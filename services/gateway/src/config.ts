import dotenv from 'dotenv';

dotenv.config();

const list = (value: string | undefined, fallback: string): string[] =>
  (value ?? fallback)
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('Переменная окружения JWT_SECRET не задана (см. .env.example)');
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  jwtSecret,
  authUrl: list(process.env.AUTH_URL, 'http://localhost:3002')[0],
  coreUrls: list(process.env.CORE_URLS, 'http://localhost:3003'),
  imageWorkerUrls: list(process.env.IMAGE_WORKER_URLS, 'http://localhost:3004'),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
};
