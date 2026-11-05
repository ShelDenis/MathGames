import { Router, Request, Response } from 'express';
import prisma from '../config/database';

const router = Router();

// Получить табло (Для всех)
// Путь: GET /api/scoreboard
router.get('/', async (req: Request, res: Response) => {
  const submissions = await prisma.submission.findMany({
    where: { status: { in: ['SCORED', 'APPEALED', 'RESOLVED'] } },
    include: { task: true, team: true, appeal: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(submissions);
});

export default router;