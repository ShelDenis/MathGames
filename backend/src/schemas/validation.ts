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

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  maxPoints: z.number().int().positive(),
  tournamentId: z.string().uuid().optional(),
});

export const createTournamentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const createTeamSchema = z.object({
  name: z.string().min(1),
  tournamentId: z.string().uuid(),
});

export const scoreSubmissionSchema = z.object({
  points: z.number().int().min(0),
});