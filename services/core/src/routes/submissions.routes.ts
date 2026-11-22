import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { getIO } from '../config/socket';
import { authMiddleware, requireRole, AuthRequest } from '../auth/auth';
import { scoreSubmissionSchema, createManualSubmissionSchema } from '../schemas/validation';
import { z } from 'zod';

const router = Router();

// Получить очередь на проверку (для жюри)
// Путь: GET /api/submissions/pending?tournamentId=...
// tournamentId — автофильтр «1 судья = 1 турнир»: жюри видит только работы своего турнира.
router.get('/pending', authMiddleware, requireRole('JURY', 'ADMIN'), async (req: Request, res: Response) => {
  const tournamentId = typeof req.query.tournamentId === 'string' ? req.query.tournamentId : undefined;

  const submissions = await prisma.submission.findMany({
    where: {
      status: 'PENDING_REVIEW',
      ...(tournamentId ? { tournamentId } : {}),
    },
    include: { task: true, team: true, image: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(submissions);
});

// Выставить баллы (для жюри). Повторный вызов = «исправить вердикт».
// Путь: POST /api/submissions/:id/score
router.post('/:id/score', authMiddleware, requireRole('JURY', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const data = scoreSubmissionSchema.parse(req.body);
    const submission = await prisma.submission.update({
      where: { id: String(req.params.id) },
      data: {
        points: data.points,
        status: 'SCORED',
        scoredAt: new Date(),
        judgedBy: req.user?.id ?? null,
      },
      include: { task: true, team: true },
    });

    getIO().emit('scoreboard_updated', submission);
    res.json(submission);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Ошибка валидации', details: error.issues });
    }
    console.error('Ошибка выставления баллов:', error);
    res.status(500).json({ error: 'Ошибка выставления баллов' });
  }
});

// Исправить вердикт (для жюри): «вернуться и поправить» уже оценённую работу.
// Путь: PATCH /api/submissions/:id/score
router.patch('/:id/score', authMiddleware, requireRole('JURY', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const data = scoreSubmissionSchema.parse(req.body);
    const submission = await prisma.submission.update({
      where: { id: String(req.params.id) },
      data: {
        points: data.points,
        status: 'SCORED',
        judgedBy: req.user?.id ?? null,
      },
      include: { task: true, team: true },
    });

    getIO().emit('scoreboard_updated', submission);
    res.json(submission);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Ошибка валидации', details: error.issues });
    }
    console.error('Ошибка исправления вердикта:', error);
    res.status(500).json({ error: 'Ошибка исправления вердикта' });
  }
});

// Подать апелляцию (Ученик)
// Путь: POST /api/submissions/:id/appeal
router.post('/:id/appeal', authMiddleware, requireRole('STUDENT', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Укажите причину апелляции' });

    const submission = await prisma.submission.update({
      where: { id: String(req.params.id) },
      data: { status: 'APPEALED' },
    });

    const appeal = await prisma.appeal.create({
      data: { submissionId: submission.id, reason },
      include: { submission: { include: { task: true, team: true, image: true } } },
    });

    getIO().emit('new_appeal', appeal);
    res.status(201).json(appeal);
  } catch (error) {
    console.error('Ошибка подачи апелляции:', error);
    res.status(500).json({ error: 'Ошибка подачи апелляции' });
  }
});

// Ручная заявка (fallback): QR не распознан или нет интернета для нормального скана.
// Представитель выбирает задачу/команду/множитель вручную, данные всё равно проверяются сервером.
// Путь: POST /api/submissions/manual
router.post('/manual', authMiddleware, requireRole('REPRESENTATIVE', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const data = createManualSubmissionSchema.parse(req.body);

    const [task, team] = await Promise.all([
      prisma.task.findUnique({ where: { id: data.taskId } }),
      prisma.team.findUnique({ where: { id: data.teamId }, include: { tournament: true } }),
    ]);

    if (!task) return res.status(404).json({ error: 'Задача не найдена' });
    if (!team) return res.status(404).json({ error: 'Команда не найдена' });
    if (task.tournamentId && team.tournamentId && task.tournamentId !== team.tournamentId) {
      return res.status(400).json({ error: 'Задача и команда из разных турниров' });
    }

    let imageId = data.imageId;

    if (imageId) {
      const image = await prisma.blankImage.findUnique({ where: { id: imageId } });
      if (!image) return res.status(404).json({ error: 'Изображение не найдено' });
      if (image.submission) {
        return res.status(409).json({ error: 'Это изображение уже зарегистрировано как заявка' });
      }
      // Раз помечена ручная проверка — статус READY, жюри увидит работу
      await prisma.blankImage.update({ where: { id: imageId }, data: { status: 'READY' } });
    } else {
      // Заявка без фото допустима (например, совсем плохой интернет) — создаём служебную запись
      const image = await prisma.blankImage.create({
        data: {
          filePath: '',
          status: 'READY',
          uploadedBy: req.user!.id,
          qrData: 'MANUAL',
          error: 'Создано вручную без изображения',
        },
      });
      imageId = image.id;
    }

    const submission = await prisma.submission.create({
      data: {
        taskId: data.taskId,
        teamId: data.teamId,
        tournamentId: team.tournamentId,
        multiplier: data.multiplier,
        imageId,
        isManual: true,
        createdById: req.user!.id,
        status: 'PENDING_REVIEW',
      },
      include: { task: true, team: true, image: true },
    });

    getIO().emit('new_submission', submission);
    res.status(201).json(submission);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Ошибка валидации', details: error.issues });
    }
    console.error('Ошибка ручной заявки:', error);
    res.status(500).json({ error: 'Ошибка создания ручной заявки' });
  }
});

// Проблемные бланки: НЕ_РАСПОЗНАН / ОШИБКА ИЛИ ЗАВИС (не обработан > staleMinutes назад).
// Путь: GET /api/submissions/problems?staleMinutes=5&tournamentId=...
router.get('/problems', authMiddleware, requireRole('JURY', 'ADMIN'), async (req: Request, res: Response) => {
  const staleMinutes = Math.max(1, Number(req.query.staleMinutes) || 5);
  const tournamentId = typeof req.query.tournamentId === 'string' ? req.query.tournamentId : undefined;
  const cutoff = new Date(Date.now() - staleMinutes * 60_000);

  const images = await prisma.blankImage.findMany({
    where: {
      submission: null,
      OR: [
        { status: 'FAILED' },
        { status: 'NEEDS_RESCAN' },
        { status: { in: ['UPLOADED', 'PROCESSING'] }, createdAt: { lt: cutoff } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  // Для зависших PENDING_REVIEW заявок — возраст ожидания оценки
  const pending = await prisma.submission.findMany({
    where: {
      status: 'PENDING_REVIEW',
      createdAt: { lt: cutoff },
      ...(tournamentId ? { tournamentId } : {}),
    },
    include: { task: true, team: true, image: true },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  res.json({ staleMinutes, stuckImages: images, longPending: pending });
});

// Метрики для дашборда: всего загружено, распознано, ошибок, скорость работы жюри.
// Путь: GET /api/submissions/metrics?tournamentId=...
router.get('/metrics', authMiddleware, requireRole('JURY', 'ADMIN'), async (req: Request, res: Response) => {
  const tournamentId = typeof req.query.tournamentId === 'string' ? req.query.tournamentId : undefined;
  const since = typeof req.query.since === 'string' ? new Date(req.query.since) : new Date(Date.now() - 24 * 3600_000);

  const subWhere = tournamentId ? { tournamentId } : {};

  const [imagesTotal, imagesFailed, imagesRescan, pendingCount, scored] = await Promise.all([
    prisma.blankImage.count(),
    prisma.blankImage.count({ where: { status: 'FAILED' } }),
    prisma.blankImage.count({ where: { status: 'NEEDS_RESCAN' } }),
    prisma.submission.count({ where: { status: 'PENDING_REVIEW', ...subWhere } }),
    prisma.submission.findMany({
      where: { status: { in: ['SCORED', 'RESOLVED'] }, scoredAt: { gte: since }, ...subWhere },
      select: { createdAt: true, scoredAt: true, isManual: true },
      orderBy: { scoredAt: 'desc' },
      take: 1000,
    }),
  ]);

  // Скорость жюри: сколько работ оценено за последнюю минуту и среднее время на работу
  const lastMinute = scored.filter((s) => s.scoredAt && s.scoredAt.getTime() >= Date.now() - 60_000);
  const durations = scored
    .filter((s) => s.scoredAt)
    .map((s) => (s.scoredAt!.getTime() - s.createdAt.getTime()) / 1000);
  const avgSeconds = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;

  res.json({
    imagesTotal,
    imagesFailed,
    imagesNeedsRescan: imagesRescan,
    pendingReview: pendingCount,
    manualCount: scored.filter((s) => s.isManual).length,
    scoredSince,
    scoredSinceCount: scored.length,
    perMinuteLast: lastMinute.length,
    avgReviewSeconds: avgSeconds,
  });
});

// Получить табло (для всех)
// Путь будет: GET /api/submissions/scoreboard
// (В server.ts подключим /api/scoreboard для красоты)
router.get('/scoreboard', async (req: Request, res: Response) => {
  const submissions = await prisma.submission.findMany({
    where: { status: { in: ['SCORED', 'APPEALED', 'RESOLVED'] } },
    include: { task: true, team: true, appeal: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(submissions);
});

export default router;
