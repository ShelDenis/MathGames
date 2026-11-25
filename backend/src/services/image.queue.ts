
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(
  process.env.REDIS_URL ?? 'redis://localhost:6379',
  { maxRetriesPerRequest: null, lazyConnect: true }
);

export const imageQueue = new Queue('image-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 }
  }
});

export async function enqueueImage(data: {
  imageId: string;
  filePath: string;
  uploadedById: string;
}) {
  await imageQueue.add(
    'process-image',
    {
      ...data,
      receivedAt: new Date().toISOString()
    },
    { jobId: data.imageId }
  );
}
