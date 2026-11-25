
import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { config } from './config';
import { isPublic } from './rules';

// Обычный журнал запросов
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', () => {
    console.log(
      `${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start} мс)`
    );
  });

  next();
}

const USER_HEADERS = ['x-user-id', 'x-user-email', 'x-user-role'];

// Проверка JWT
export function authenticate(req: Request, res: Response, next: NextFunction) {
  // Клиент не должен подделывать эти заголовки
  for (const name of USER_HEADERS) {
    delete req.headers[name];
  }

  const header = req.headers.authorization;
  let payload: JwtPayload | null = null;
  let invalid = false;

  if (header?.startsWith('Bearer ')) {
    try {
      payload = jwt.verify(header.slice(7), config.jwtSecret) as JwtPayload;
    } catch {
      invalid = true;
    }
  }

  if (payload) {
    req.headers['x-user-id'] = String(payload.id ?? '');
    req.headers['x-user-email'] = String(payload.email ?? '');
    req.headers['x-user-role'] = String(payload.role ?? '');
  }

  // Открытые маршруты
  if (isPublic(req.method, req.path)) {
    return next();
  }

  if (!header) {
    return res.status(401).json({ error: 'Токен не предоставлен' });
  }

  if (invalid) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }

  next();
}
