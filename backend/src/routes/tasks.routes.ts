import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { authMiddleware, requireRole, AuthRequest } from '../auth/auth';
import { createTaskSchema } from '../schemas/validation';
import { z } from 'zod';

const router = Router();

router.get('/', async (req, res) => {
  const { tournamentId } = req.query;
  
  const where = tournamentId ? { tournamentId: tournamentId as string } : {};
  
  const tasks = await prisma.task.findMany({ 
    where,
    include: { tournament: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' } 
  });
  res.json(tasks);
});

router.post('/', authMiddleware, requireRole('ADMIN', 'COMPOSER'), async (req: AuthRequest, res) => {
  try {
    const data = createTaskSchema.parse(req.body);
    const task = await prisma.task.create({ 
      data: {
        title: data.title,
        description: data.description,
        maxPoints: data.maxPoints,
        tournamentId: data.tournamentId || null,
      }
    });
    res.status(201).json(task);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Ошибка валидации', details: error.errors });
    }
    res.status(500).json({ error: 'Ошибка создания задачи' });
  }
});

router.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  await prisma.task.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;