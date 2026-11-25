// Демо: имитируем пиковую нагрузку (30 бланков), проверяем, что Redis и очередь работают.
// Запуск:  npm run demo   (Redis должен быть запущен)

import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import {
  createRedisConnection,
  createImageQueue,
  createImageWorker,
  enqueueImage,
  ImageJobResult,
} from './queue';

dotenv.config();

const TOTAL = 30;

async function main() {
  const queueConnection = createRedisConnection();
  const workerConnection = createRedisConnection();
  const queue = createImageQueue(queueConnection);

  let done = 0;
  const started = Date.now();

  const worker = createImageWorker(async (job): Promise<ImageJobResult> => {
    await new Promise((r) => setTimeout(r, 200)); // имитация работы с картинкой
    return { imageId: job.data.imageId, status: 'recognized', blankCode: `BLANK:${job.id?.slice(0, 5)}` };
  }, workerConnection);

  const finished = new Promise<void>((resolve) => {
    worker.on('completed', (job, result) => {
      done++;
      console.log(`[${done}/${TOTAL}] готово: ${result.blankCode}`);
      if (done === TOTAL) resolve();
    });
    worker.on('failed', (job, err) => console.error('Ошибка задачи', job?.id, err.message));
  });

  for (let i = 0; i < TOTAL; i++) {
    await enqueueImage(queue, {
      imageId: randomUUID(),
      filePath: `/uploads/demo-${i}.jpg`,
      receivedAt: new Date().toISOString(),
    });
  }
  console.log(`В очередь добавлено ${TOTAL} задач`);

  await finished;
  console.log(`Все ${TOTAL} задач обработаны за ${Date.now() - started} мс`);

  await worker.close();
  await queue.close();
  queueConnection.disconnect();
  workerConnection.disconnect();
}

main().catch((e) => {
  console.error('Не удалось связаться с Redis. Он запущен? ', e);
  process.exit(1);
});
