import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { authMiddleware, requireRole, AuthRequest } from '../auth/auth';
import { createTournamentSchema, createTeamSchema } from '../schemas/validation';
import { z } from 'zod';

const router = Router();

// GET /api/tournaments - получить все турниры
router.get('/', async (req: Request, res: Response) => {
  const tournaments = await prisma.tournament.findMany({
    include: { 
      teams: true, 
      _count: { select: { teams: true } },
      tasks: true
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(tournaments);
});

// GET /api/tournaments/:id - получить турнир по ID
router.get('/:id', async (req: Request, res: Response) => {
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id },
    include: { 
      teams: { include: { members: true } },
      tasks: true
    },
  });
  if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
  res.json(tournament);
});

// POST /api/tournaments - создать турнир
router.post('/', authMiddleware, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const data = createTournamentSchema.parse(req.body);
    const tournament = await prisma.tournament.create({
      data: {
        name: data.name,
        description: data.description,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
    });
    res.status(201).json(tournament);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Ошибка валидации', details: error.errors });
    }
    res.status(500).json({ error: 'Ошибка создания турнира' });
  }
});

// POST /api/tournaments/:id/start - запустить турнир
router.post('/:id/start', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const tournament = await prisma.tournament.update({
    where: { id: req.params.id },
    data: { status: 'ACTIVE' },
  });
  res.json(tournament);
});

// POST /api/tournaments/:id/finish - завершить турнир
router.post('/:id/finish', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const tournament = await prisma.tournament.update({
    where: { id: req.params.id },
    data: { status: 'FINISHED' },
  });
  res.json(tournament);
});

// GET /api/tournaments/:tournamentId/teams - получить команды турнира
router.get('/:tournamentId/teams', async (req: Request, res: Response) => {
  const teams = await prisma.team.findMany({
    where: { tournamentId: req.params.tournamentId },
    include: { members: true },
  });
  res.json(teams);
});

// POST /api/tournaments/:tournamentId/teams - создать команду в турнире
router.post('/:tournamentId/teams', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const data = createTeamSchema.parse({
      ...req.body,
      tournamentId: req.params.tournamentId, // Берём из URL
    });
    const team = await prisma.team.create({
      data: { name: data.name, tournamentId: data.tournamentId },
      include: { members: true },
    });
    res.status(201).json(team);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Ошибка валидации', details: error.errors });
    }
    res.status(500).json({ error: 'Ошибка создания команды' });
  }
});

// POST /api/tournaments/:tournamentId/teams/:teamId/members/:userId - добавить участника
router.post('/:tournamentId/teams/:teamId/members/:userId', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: { teamId: req.params.teamId },
  });
  res.json(user);
});

export default router;