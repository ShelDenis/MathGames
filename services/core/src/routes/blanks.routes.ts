
import { Router, Request, Response } from 'express';
import { randomInt } from 'crypto';
import prisma from '../config/database';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import path from 'path';

const router = Router();

function transliterate(text: string): string {
  const map: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    ' ': '_', '-': '_'
  };

  return text.toLowerCase()
    .split('')
    .map(c => map[c] ?? c)
    .join('')
    .replace(/[^a-z0-9_-]/g, '_');
}

async function ensureTaskCodes(
  tasks: { id: string; code: string | null }[]
): Promise<void> {
  const existing = await prisma.task.findMany({
    where: { code: { not: null } },
    select: { code: true }
  });

  const used = new Set(
    existing.map(task => task.code).filter((code): code is string => code !== null)
  );

  let number = 1;

  for (const task of tasks) {
    if (task.code) continue;

    let code: string;

    do {
      code = `T${String(number++).padStart(3, '0')}`;
    } while (used.has(code));

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { code },
      select: { code: true }
    });

    task.code = updated.code;
    used.add(code);
  }
}

async function getOrCreatePrintedBlank(
  taskId: string,
  teamId: string,
  multiplier: number,
  basePoints: number
) {
  const existing = await prisma.printedBlank.findFirst({
    where: { taskId, teamId, multiplier }
  });

  if (existing) {
    if (existing.basePoints !== basePoints) {
      return prisma.printedBlank.update({
        where: { id: existing.id },
        data: { basePoints }
      });
    }

    return existing;
  }

  // Короткий числовой код для QR; проверяем уникальность в базе.
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = String(randomInt(10000, 100000));

    const duplicate = await prisma.printedBlank.findUnique({
      where: { code }
    });

    if (duplicate) continue;

    return prisma.printedBlank.create({
      data: {
        code,
        taskId,
        teamId,
        multiplier,
        basePoints
      }
    });
  }

  throw new Error('Не удалось подобрать уникальный код бланка');
}

// GET /api/blanks/generate-team?teamId=...
router.get('/generate-team', async (req: Request, res: Response) => {
  try {
    const teamId = req.query.teamId;

    if (typeof teamId !== 'string' || !teamId) {
      return res.status(400).json({ error: 'Не указан teamId' });
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { tournament: true }
    });

    if (!team) {
      return res.status(404).json({ error: 'Команда не найдена' });
    }

    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          { tournamentId: team.tournamentId },
          { tournamentId: null }
        ]
      },
      orderBy: { id: 'asc' }
    });

    if (tasks.length === 0) {
      return res.status(404).json({
        error: 'Нет задач для этого турнира'
      });
    }

    await ensureTaskCodes(tasks);

    const fontPath = path.join(__dirname, '../../fonts/DejaVuSans.ttf');
    const safeName = transliterate(team.name);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=blanks_${safeName}.pdf`
    );

    const doc = new PDFDocument({ size: 'A6', margin: 15 });

    doc.on('error', error => {
      console.error('Ошибка создания PDF:', error);
    });

    doc.pipe(res);
    doc.font(fontPath);

    let isFirstPage = true;

    for (const task of tasks) {
      for (const multiplier of [1, 2, 3]) {
        if (!isFirstPage) doc.addPage();
        isFirstPage = false;

        const blank = await getOrCreatePrintedBlank(
          task.id,
          team.id,
          multiplier,
          task.maxPoints
        );

        doc.fontSize(10)
          .fillColor('gray')
          .text(`Команда: ${team.name}`, { align: 'center' });

        doc.moveDown(0.2);

        doc.fontSize(14)
          .fillColor('black')
          .text(`Задача: ${task.code} — ${task.title}`, { align: 'center' });

        doc.moveDown(0.3);

        doc.fontSize(11)
          .text(task.description, {
            align: 'center',
            width: doc.page.width - 30
          });

        doc.moveDown(0.5);

        const color =
          multiplier === 1 ? 'black' : multiplier === 2 ? 'blue' : 'red';

        doc.fontSize(18)
          .fillColor(color)
          .text(`Множитель: ×${multiplier}`, { align: 'center' });

        doc.moveDown(0.5);
        doc.fillColor('black');

        // QR содержит только код. Данные бланка хранятся в базе.
        const qrPayload = `BLANK:${blank.code}`;

        const qrDataUrl = await QRCode.toDataURL(qrPayload, {
          width: 200,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#ffffff' }
        });

        doc.image(qrDataUrl, {
          fit: [160, 160],
          align: 'center'
        });

        doc.moveDown(0.3);

        doc.fontSize(9)
          .fillColor('gray')
          .text('Отсканируйте представителем', { align: 'center' });
      }
    }

    doc.end();
  } catch (error) {
    console.error('Ошибка генерации PDF:', error);

    if (!res.headersSent) {
      res.status(500).json({ error: 'Ошибка генерации PDF' });
    } else {
      res.destroy(error instanceof Error ? error : undefined);
    }
  }
});

export default router;
