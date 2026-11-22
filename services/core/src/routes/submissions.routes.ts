import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { getIO } from '../config/socket';
import { authMiddleware, requireRole, AuthRequest } from '../auth/auth';
import { scoreSubmissionSchema } from '../schemas/validation';
import { z } from 'zod';

const router = Router();

// РџРѕР»СѓС‡РёС‚СЊ РѕС‡РµСЂРµРґСЊ РЅР° РїСЂРѕРІРµСЂРєСѓ (РґР»СЏ Р¶СЋСЂРё)
// РџСѓС‚СЊ Р±СѓРґРµС‚: GET /api/submissions/pending
router.get('/pending', authMiddleware, requireRole('JURY', 'ADMIN'), async (req: Request, res: Response) => {
  const submissions = await prisma.submission.findMany({
    where: { status: 'PENDING_REVIEW' },
    include: { task: true, team: true, image: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(submissions);
});

// Р’С‹СЃС‚Р°РІРёС‚СЊ Р±Р°Р»Р»С‹ (РґР»СЏ Р¶СЋСЂРё)
// РџСѓС‚СЊ Р±СѓРґРµС‚: POST /api/submissions/:id/score
router.post('/:id/score', authMiddleware, requireRole('JURY', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const data = scoreSubmissionSchema.parse(req.body);
    const submission = await prisma.submission.update({
      where: { id: String(req.params.id) },
      data: { points: data.points, status: 'SCORED' },
      include: { task: true, team: true },
    });
    
    // РСЃРїРѕР»СЊР·СѓРµРј getIO() РІРјРµСЃС‚Рѕ РіР»РѕР±Р°Р»СЊРЅРѕРіРѕ io
    getIO().emit('scoreboard_updated', submission);
    res.json(submission);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'РћС€РёР±РєР° РІР°Р»РёРґР°С†РёРё', details: error.issues });
    }
    console.error('РћС€РёР±РєР° РІС‹СЃС‚Р°РІР»РµРЅРёСЏ Р±Р°Р»Р»РѕРІ:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° РІС‹СЃС‚Р°РІР»РµРЅРёСЏ Р±Р°Р»Р»РѕРІ' });
  }
});

// РџРѕРґР°С‚СЊ Р°РїРµР»Р»СЏС†РёСЋ (РЈС‡РµРЅРёРє)
// РџСѓС‚СЊ Р±СѓРґРµС‚: POST /api/submissions/:id/appeal
router.post('/:id/appeal', authMiddleware, requireRole('STUDENT', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'РЈРєР°Р¶РёС‚Рµ РїСЂРёС‡РёРЅСѓ Р°РїРµР»Р»СЏС†РёРё' });

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
    console.error('РћС€РёР±РєР° РїРѕРґР°С‡Рё Р°РїРµР»Р»СЏС†РёРё:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° РїРѕРґР°С‡Рё Р°РїРµР»Р»СЏС†РёРё' });
  }
});

// РџРѕР»СѓС‡РёС‚СЊ С‚Р°Р±Р»Рѕ (РґР»СЏ РІСЃРµС…)
// РџСѓС‚СЊ Р±СѓРґРµС‚: GET /api/submissions/scoreboard 
// (Р’ server.ts РїРѕРґРєР»СЋС‡РёРј РєР°Рє /api/scoreboard РґР»СЏ РєСЂР°СЃРѕС‚С‹)
router.get('/scoreboard', async (req: Request, res: Response) => {
  const submissions = await prisma.submission.findMany({
    where: { status: { in: ['SCORED', 'APPEALED', 'RESOLVED'] } },
    include: { task: true, team: true, appeal: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(submissions);
});

export default router;
