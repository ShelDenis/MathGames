// Контракт очереди обработки бланков.
//
// Кто что делает:
//   * Core / Image Worker (приём фото) кладёт задачу:  enqueueImage(queue, {...})
//   * Image Worker (обработчик) забирает задачи:        createImageWorker(handler)
//
// Участникам 2 и 3: скопируйте этот файл к себе (или импортируйте) и не меняйте
// имя очереди и поля ImageJobData без согласования.

import { Queue, Worker, Processor } from 'bullmq';
import IORedis from 'ioredis';

export const IMAGE_QUEUE_NAME = 'image-processing';

// Что кладём в очередь. Только лёгкие данные: сама картинка лежит на диске.
export interface ImageJobData {
  imageId: string; // id записи BlankImage в БД (он же jobId, защита от дублей)
  filePath: string; // где лежит загруженный файл
  tournamentId?: string;
  uploadedById?: string; // кто загрузил (представитель)
  receivedAt: string; // ISO-время получения
}

// Что возвращает обработчик
export interface ImageJobResult {
  imageId: string;
  status: 'recognized' | 'not_recognized' | 'manual_required';
  blankCode?: string; // например, из QR "BLANK:12345"
}

export function createRedisConnection(url = process.env.REDIS_URL ?? 'redis://localhost:6379') {
  // maxRetriesPerRequest: null - обязательное требование BullMQ для воркеров
  return new IORedis(url, { maxRetriesPerRequest: null });
}

export function createImageQueue(connection: IORedis) {
  return new Queue<ImageJobData, ImageJobResult>(IMAGE_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3, // 3 попытки, если обработка упала
      backoff: { type: 'exponential', delay: 2000 }, // паузы 2 с, 4 с, ...
      removeOnComplete: { count: 1000 }, // не копить историю бесконечно
      removeOnFail: { count: 5000 }, // неудачные храним дольше, чтобы разобраться
    },
  });
}

// jobId = imageId: одно и то же фото дважды в очередь не попадёт
export function enqueueImage(queue: Queue<ImageJobData, ImageJobResult>, data: ImageJobData) {
  return queue.add('process-image', data, { jobId: data.imageId });
}

export function createImageWorker(
  handler: Processor<ImageJobData, ImageJobResult>,
  connection: IORedis,
  concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5),
) {
  return new Worker<ImageJobData, ImageJobResult>(IMAGE_QUEUE_NAME, handler, {
    connection,
    concurrency,
  });
}
