
import sharp from 'sharp';
import jsQR from 'jsqr';
import path from 'path';
import prisma from '../config/database';
import { getIO } from '../config/socket';

export async function processImage(imageId: string, filePath: string) {
  const io = getIO();

  try {
    const thumbnailPath = filePath + '_thumb.jpg';

    // Создаём превью для интерфейса проверки.
    await sharp(filePath)
      .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);

    let status: 'READY' | 'NEEDS_RESCAN' = 'NEEDS_RESCAN';
    let qrData: string | null = null;
    let submission: { id: string } | null = null;

    try {
      // Уменьшаем изображение перед распознаванием QR.
      const { data, info } = await sharp(filePath)
        .rotate()
        .resize(1000, 1000, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .toColourspace('srgb')
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const pixels = new Uint8ClampedArray(
        data.buffer,
        data.byteOffset,
        data.byteLength
      );

      const code = jsQR(pixels, info.width, info.height);

      if (code?.data) {
        qrData = code.data;

        // Поддерживаем новый короткий формат BLANK:12345.
        const match = /^BLANK:(\d{5})$/.exec(code.data.trim());

        if (match) {
          const blankCode = match[1];

          const blank = await prisma.printedBlank.findUnique({
            where: { code: blankCode },
            include: { task: true, team: true }
          });

          if (blank) {
            submission = await prisma.submission.create({
              data: {
                taskId: blank.taskId,
                teamId: blank.teamId,
                multiplier: blank.multiplier,
                status: 'PENDING_REVIEW',
                imageId
              },
              select: { id: true }
            });

            status = 'READY';

            console.log(
              `QR распознан: ${blank.code}, задача ${blank.task.code ?? blank.taskId}, команда ${blank.team.name}, ×${blank.multiplier}`
            );

            io.emit('new_submission', {
              ...submission,
              task: blank.task,
              team: blank.team
            });
          } else {
            console.warn(`QR-код не найден в базе: ${blankCode}`);
          }
        } else {
          console.warn('QR имеет неподдерживаемый формат:', code.data);
        }
      }
    } catch (qrError) {
      console.error(
        'Ошибка распознавания или сохранения результата QR:',
        qrError instanceof Error ? qrError.message : qrError
      );
    }

    await prisma.blankImage.update({
      where: { id: imageId },
      data: {
        status,
        thumbnailPath: path.basename(thumbnailPath),
        qrData
      }
    });

    io.emit('image_processed', {
      imageId,
      status: status.toLowerCase(),
      submissionId: submission?.id,
      qrData
    });
  } catch (err) {
    console.error('Критическая ошибка обработки изображения:', err);

    await prisma.blankImage.update({
      where: { id: imageId },
      data: { status: 'FAILED' }
    });

    io.emit('image_processed', {
      imageId,
      status: 'failed'
    });
  }
}
