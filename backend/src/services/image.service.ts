import sharp from 'sharp';
import jsQR from 'jsqr';
import path from 'path';
import prisma from '../config/database';
import { getIO } from '../config/socket';

export async function processImage(imageId: string, filePath: string) {
  const io = getIO();

  try {
    // 1. Генерация превью
    const thumbnailPath = filePath + '_thumb.jpg';
    await sharp(filePath)
      .resize(300, 300, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);

    // 2. Распознавание QR-кода
    let status: 'READY' | 'NEEDS_RESCAN' = 'NEEDS_RESCAN';
    let qrData: string | null = null;
    let submission = null;

    try {
      const { data, info } = await sharp(filePath)
        .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
        .toColourspace('srgb')
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const uint8Data = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
      const code = jsQR(uint8Data, info.width, info.height);

      if (code && code.data) {
        try {
          const qrPayload = JSON.parse(code.data);
          const { taskId, teamId, multiplier } = qrPayload;

          if (taskId && teamId && multiplier) {
            status = 'READY';
            qrData = code.data;

            submission = await prisma.submission.create({
              data: {
                taskId,
                teamId,
                multiplier,
                status: 'PENDING_REVIEW',
                imageId,
              },
              include: { task: true, team: true },
            });

            console.log(`✅ QR распознан: задача ${taskId}, команда ${teamId}, ×${multiplier}`);
            io.emit('new_submission', submission);
          }
        } catch (parseError) {
          console.warn('⚠️ Не удалось распарсить JSON из QR:', code.data);
        }
      }
    } catch (qrError) {
      console.log('QR не распознан:', qrError instanceof Error ? qrError.message : qrError);
    }

    // 3. Обновление статуса изображения
    await prisma.blankImage.update({
      where: { id: imageId },
      data: {
        status,
        thumbnailPath: path.basename(thumbnailPath),
        qrData
      },
    });

    // 4. Уведомление клиента
    io.emit('image_processed', {
      imageId,
      status: status.toLowerCase(),
      submissionId: submission?.id,
      qrData: qrData
    });

  } catch (err) {
    // Внешний catch для критических ошибок (например, если упал sharp или БД)
    console.error('Критическая ошибка обработки изображения:', err);
    await prisma.blankImage.update({
      where: { id: imageId },
      data: { status: 'FAILED' },
    });
    io.emit('image_processed', { imageId, status: 'failed' });
  }
}