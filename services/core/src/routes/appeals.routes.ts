import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { getIO } from '../config/socket';
import { authMiddleware, requireRole, AuthRequest } from '../auth/auth';

const router = Router();

// РџРѕР»СѓС‡РёС‚СЊ РѕС‡РµСЂРµРґСЊ Р°РїРµР»Р»СЏС†РёР№ (Р–СЋСЂРё)
// РџСѓС‚СЊ Р±СѓРґРµС‚: GET /api/appeals/pending
router.get('/pending', authMiddleware, requireRole('JURY', 'ADMIN'), async (req: Request, res: Response) => {
  const appeals = await prisma.appeal.findMany({
    where: { status: 'PENDING' },
    include: {
      submission: { include: { task: true, team: true, image: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(appeals);
});

// Р Р°СЃСЃРјРѕС‚СЂРµС‚СЊ Р°РїРµР»Р»СЏС†РёСЋ (Р–СЋСЂРё)
// РџСѓС‚СЊ Р±СѓРґРµС‚: POST /api/appeals/:id/resolve
router.post('/:id/resolve', authMiddleware, requireRole('JURY', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { action, newPoints } = req.body; // action: 'ACCEPTED' | 'REJECTED'
    
    const appeal = await prisma.appeal.update({
      where: { id: String(req.params.id) },
      data: { status: action, resolvedAt: new Date() },
      include: { submission: true },
    });

    if (action === 'ACCEPTED') {
      await prisma.submission.update({
        where: { id: appeal.submissionId },
        data: { points: newPoints, status: 'RESOLVED' },
      });
    } else {
      await prisma.submission.update({
        where: { id: appeal.submissionId },
        data: { status: 'RESOLVED' },
      });
    }

    const updatedSubmission = await prisma.submission.findUnique({
      where: { id: appeal.submissionId },
      include: { task: true, team: true, appeal: true },
    });
    
    getIO().emit('scoreboard_updated', updatedSubmission);
    res.json(appeal);
  } catch (error) {
    console.error('РћС€РёР±РєР° СЂР°СЃСЃРјРѕС‚СЂРµРЅРёСЏ Р°РїРµР»Р»СЏС†РёРё:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЂР°СЃСЃРјРѕС‚СЂРµРЅРёСЏ Р°РїРµР»Р»СЏС†РёРё' });
  }
});

export default router;
