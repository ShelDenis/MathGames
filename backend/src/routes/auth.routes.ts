import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { 
  hashPassword, 
  comparePassword, 
  generateToken, 
  authMiddleware, 
  AuthRequest 
} from '../auth/auth';
import { registerSchema, loginSchema } from '../schemas/validation';
import { z } from 'zod';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);
    
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }
    
    const hashedPassword = await hashPassword(data.password);
    
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        role: data.role || 'STUDENT',
      },
      select: { id: true, email: true, name: true, role: true },
    });
    
    const token = generateToken({ id: user.id, email: user.email, role: user.role });
    res.status(201).json({ user, token });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Ошибка валидации', details: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);
    
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }
    
    const isValid = await comparePassword(data.password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }
    
    const token = generateToken({ id: user.id, email: user.email, role: user.role });
    
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Ошибка валидации', details: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, role: true, teamId: true },
  });
  
  if (!user) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  
  res.json(user);
});

export default router;