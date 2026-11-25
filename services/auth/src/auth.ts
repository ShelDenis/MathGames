import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { env } from './env';

// Формат токена такой же, как в монолите ({ id, email, role }),
// поэтому Core Service и Gateway проверяют его тем же секретом без изменений.
export interface TokenPayload {
  id: string;
  email: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, 10);

export const comparePassword = (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(password, hash);

export const generateToken = (payload: TokenPayload): string =>
  jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });

// Возвращает данные пользователя из заголовка Authorization или null
export const readToken = (req: Request): TokenPayload | null => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), env.JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
};

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.headers.authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Токен не предоставлен' });
  }
  const user = readToken(req);
  if (!user) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
  req.user = user;
  next();
};
