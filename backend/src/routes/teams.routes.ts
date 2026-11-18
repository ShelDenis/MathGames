import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { authMiddleware, requireRole, AuthRequest } from '../auth/auth';
import { createTeamSchema } from '../schemas/validation';
import { z } from 'zod';

const router = Router();

// POST /api/teams
router.post('/', authMiddleware, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const data = createTeamSchema.parse(req.body);
    
    const team = await prisma.team.create({
      data: { 
        name: data.name, 
        tournamentId: data.tournamentId 
      },
      include: { members: true },
    });
    
    res.status(201).json(team);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Ошибка валидации', details: error.errors });
    }
    console.error('Ошибка создания команды:', error);
    res.status(500).json({ error: 'Ошибка создания команды' });
  }
});

export default router;