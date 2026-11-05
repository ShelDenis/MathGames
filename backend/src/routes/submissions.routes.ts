import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { getIO } from '../config/socket';
import { authMiddleware, requireRole, AuthRequest } from '../auth/auth';
import { scoreSubmissionSchema } from '../schemas/validation';
import { z } from 'zod';

const router = Router();

// Получить очередь на проверку (для жюри)
// Путь будет: GET /api/submissions/pending
router.get('/pending', authMiddleware, requireRole('JURY', 'ADMIN'), async (req: Request, res: Response) => {
  const submissions = await prisma.submission.findMany({
    where: { status: 'PENDING_REVIEW' },
    include: { task: true, team: true, image: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(submissions);
});

// Выставить баллы (для жюри)
// Путь будет: POST /api/submissions/:id/score
router.post('/:id/score', authMiddleware, requireRole('JURY', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const data = scoreSubmissionSchema.parse(req.body);
    const submission = await prisma.submission.update({
      where: { id: req.params.id },
      data: { points: data.points, status: 'SCORED' },
      include: { task: true, team: true },
    });
    
    // Используем getIO() вместо глобального io
    getIO().emit('scoreboard_updated', submission);
    res.json(submission);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Ошибка валидации', details: error.errors });
    }
    console.error('Ошибка выставления баллов:', error);
    res.status(500).json({ error: 'Ошибка выставления баллов' });
  }
});

// Подать апелляцию (Ученик)
// Путь будет: POST /api/submissions/:id/appeal
router.post('/:id/appeal', authMiddleware, requireRole('STUDENT', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Укажите причину апелляции' });

    const submission = await prisma.submission.update({
      where: { id: req.params.id },
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

// Получить табло (для всех)
// Путь будет: GET /api/submissions/scoreboard 
// (В server.ts подключим как /api/scoreboard для красоты)
router.get('/scoreboard', async (req: Request, res: Response) => {
  const submissions = await prisma.submission.findMany({
    where: { status: { in: ['SCORED', 'APPEALED', 'RESOLVED'] } },
    include: { task: true, team: true, appeal: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(submissions);
});

export default router;