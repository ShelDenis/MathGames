// Быстрая проверка всей цепочки через Gateway. Запуск: npm run smoke
// (Auth, Gateway и Core должны быть запущены)
const GW = process.env.GATEWAY_URL ?? 'http://localhost:3001';
let failed = 0;

const check = (ok, name, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : '  <- ' + extra}`);
};
const call = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(GW + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
};

try {
  let r = await call('/api/health');
  check(r.status === 200, 'Gateway жив (/api/health)', JSON.stringify(r));

  r = await call('/api/health/all');
  check(r.status === 200, 'Все сервисы отвечают (/api/health/all)', JSON.stringify(r.data));
  if (r.data?.services) {
    for (const s of r.data.services) console.log(`       ${s.ok ? '+' : '-'} ${s.name} ${s.url}`);
  }

  const email = `smoke-${Date.now()}@test.local`;
  r = await call('/api/auth/register', { method: 'POST', body: { email, password: 'secret123', name: 'Smoke' } });
  check(r.status === 201 && r.data?.token, 'Регистрация через Gateway -> Auth', JSON.stringify(r));

  r = await call('/api/auth/login', { method: 'POST', body: { email, password: 'secret123' } });
  check(r.status === 200 && r.data?.token, 'Вход возвращает JWT', JSON.stringify(r));
  const token = r.data?.token;

  r = await call('/api/auth/login', { method: 'POST', body: { email, password: 'неверный' } });
  check(r.status === 401, 'Неверный пароль -> 401', JSON.stringify(r));

  r = await call('/api/auth/me', { token });
  check(r.status === 200 && r.data?.email === email, '/api/auth/me с токеном', JSON.stringify(r));

  r = await call('/api/submissions/pending');
  check(r.status === 401, 'Защищённый маршрут без токена -> 401 (Gateway)', JSON.stringify(r));

  r = await call('/api/submissions/pending', { token });
  check([200, 403].includes(r.status), 'С токеном запрос доходит до Core (200, либо 403 по роли)', JSON.stringify(r));

  r = await call('/api/tasks');
  check(r.status === 200, 'Публичный список задач открыт без токена', JSON.stringify(r));
} catch (e) {
  failed++;
  console.error('Ошибка запроса. Gateway запущен? ', e.message);
}

console.log(failed ? `\nПровалено проверок: ${failed}` : '\nВсё хорошо');
// exitCode вместо process.exit(): иначе вывод может обрезаться
process.exitCode = failed ? 1 : 0;
