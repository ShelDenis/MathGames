// Какие запросы можно делать БЕЗ токена. Всё остальное требует действительный JWT.
// Список повторяет то, что в монолите было открыто (там не было authMiddleware).
// Проверка ролей (ADMIN, JURY и т. д.) остаётся в самих сервисах.

interface PublicRule {
  method: string; // '*' - любой метод
  pattern: RegExp;
}

const PUBLIC_RULES: PublicRule[] = [
  { method: 'POST', pattern: /^\/api\/auth\/(login|register)\/?$/ },
  { method: 'GET', pattern: /^\/api\/health(\/.*)?$/ },
  { method: 'GET', pattern: /^\/api\/tasks\/?$/ },
  { method: 'GET', pattern: /^\/api\/tournaments(\/.*)?$/ },
  { method: 'GET', pattern: /^\/api\/scoreboard\/?$/ },
  { method: 'GET', pattern: /^\/api\/submissions\/scoreboard\/?$/ },
  { method: 'GET', pattern: /^\/api\/blanks(\/.*)?$/ },
  { method: 'GET', pattern: /^\/uploads\/.*/ },
  { method: '*', pattern: /^\/socket\.io\/.*/ },
];

export function isPublic(method: string, path: string): boolean {
  if (method === 'OPTIONS') return true; // CORS preflight
  return PUBLIC_RULES.some(
    (rule) => (rule.method === '*' || rule.method === method) && rule.pattern.test(path),
  );
}
