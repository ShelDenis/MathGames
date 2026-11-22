import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { authMiddleware, requireRole, AuthRequest } from '../auth/auth';
import { createTournamentSchema, createTeamSchema } from '../schemas/validation';
import { z } from 'zod';

const router = Router();

// GET /api/tournaments - РїРѕР»СѓС‡РёС‚СЊ РІСЃРµ С‚СѓСЂРЅРёСЂС‹
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

// GET /api/tournaments/:id - РїРѕР»СѓС‡РёС‚СЊ С‚СѓСЂРЅРёСЂ РїРѕ ID
router.get('/:id', async (req: Request, res: Response) => {
  const tournament = await prisma.tournament.findUnique({
    where: { id: String(req.params.id) },
    include: { 
      teams: { include: { members: true } },
      tasks: true
    },
  });
  if (!tournament) return res.status(404).json({ error: 'РўСѓСЂРЅРёСЂ РЅРµ РЅР°Р№РґРµРЅ' });
  res.json(tournament);
});

// POST /api/tournaments - СЃРѕР·РґР°С‚СЊ С‚СѓСЂРЅРёСЂ
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
      return res.status(400).json({ error: 'РћС€РёР±РєР° РІР°Р»РёРґР°С†РёРё', details: error.issues });
    }
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ С‚СѓСЂРЅРёСЂР°' });
  }
});

// POST /api/tournaments/:id/start - Р·Р°РїСѓСЃС‚РёС‚СЊ С‚СѓСЂРЅРёСЂ
router.post('/:id/start', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const tournament = await prisma.tournament.update({
    where: { id: String(req.params.id) },
    data: { status: 'ACTIVE' },
  });
  res.json(tournament);
});

// POST /api/tournaments/:id/finish - Р·Р°РІРµСЂС€РёС‚СЊ С‚СѓСЂРЅРёСЂ
router.post('/:id/finish', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const tournament = await prisma.tournament.update({
    where: { id: String(req.params.id) },
    data: { status: 'FINISHED' },
  });
  res.json(tournament);
});

// GET /api/tournaments/:tournamentId/teams - РїРѕР»СѓС‡РёС‚СЊ РєРѕРјР°РЅРґС‹ С‚СѓСЂРЅРёСЂР°
router.get('/:tournamentId/teams', async (req: Request, res: Response) => {
  const teams = await prisma.team.findMany({
    where: { tournamentId: String(req.params.tournamentId) },
    include: { members: true },
  });
  res.json(teams);
});

// POST /api/tournaments/:tournamentId/teams - СЃРѕР·РґР°С‚СЊ РєРѕРјР°РЅРґСѓ РІ С‚СѓСЂРЅРёСЂРµ
router.post('/:tournamentId/teams', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const data = createTeamSchema.parse({
      ...req.body,
      tournamentId: String(req.params.tournamentId), // Р‘РµСЂС‘Рј РёР· URL
    });
    const team = await prisma.team.create({
      data: { name: data.name, tournamentId: data.tournamentId },
      include: { members: true },
    });
    res.status(201).json(team);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'РћС€РёР±РєР° РІР°Р»РёРґР°С†РёРё', details: error.issues });
    }
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ РєРѕРјР°РЅРґС‹' });
  }
});

// POST /api/tournaments/:tournamentId/teams/:teamId/members/:userId - РґРѕР±Р°РІРёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєР°
router.post('/:tournamentId/teams/:teamId/members/:userId', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const user = await prisma.user.update({
    where: { id: String(req.params.userId) },
    data: { teamId: String(req.params.teamId) },
  });
  res.json(user);
});

export default router;
