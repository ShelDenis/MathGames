import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['ADMIN', 'JURY', 'REPRESENTATIVE', 'COMPOSER', 'STUDENT']).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});
