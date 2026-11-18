import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from './db';
import { env } from './env';
import {
  hashPassword,
  comparePassword,
  generateToken,
  authMiddleware,
  readToken,
  AuthRequest,
} from './auth';
import { registerSchema, loginSchema } from './schemas';

const router = Router();

const validationError = (res: Response, error: z.ZodError) =>
  res.status(400).json({ error: 'Ошибка валидации', details: error.issues });

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);
    const role = data.role ?? 'STUDENT';

    // Если самостоятельный выбор роли выключен, не-студентов создаёт только админ
    if (role !== 'STUDENT' && !env.ALLOW_ROLE_SELECTION) {
      const caller = readToken(req);
      if (!caller || caller.role !== 'ADMIN') {
        return res
          .status(403)
          .json({ error: 'Пользователя с такой ролью может создать только администратор' });
      }
    }

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: await hashPassword(data.password),
        name: data.name,
        role,
      },
      select: { id: true, email: true, name: true, role: true },
    });

    const token = generateToken({ id: user.id, email: user.email, role: user.role });
    res.status(201).json({ user, token });
  } catch (error) {
    if (error instanceof z.ZodError) return validationError(res, error);
    console.error(error);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: data.email } });
    // Одинаковый ответ для «нет пользователя» и «неверный пароль»
    if (!user || !(await comparePassword(data.password, user.password))) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const token = generateToken({ id: user.id, email: user.email, role: user.role });
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return validationError(res, error);
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
