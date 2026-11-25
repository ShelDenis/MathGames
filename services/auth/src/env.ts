import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Переменная окружения ${name} не задана (см. .env.example)`);
  }
  return value;
}

export const env = {
  PORT: Number(process.env.PORT ?? 3002),
  DATABASE_URL: required('DATABASE_URL'),
  // Запасного значения нет специально: без секрета сервис не должен стартовать
  JWT_SECRET: required('JWT_SECRET'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '7d',
  ALLOW_ROLE_SELECTION: (process.env.ALLOW_ROLE_SELECTION ?? 'true') === 'true',
};
