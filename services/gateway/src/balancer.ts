// Балансировка Round Robin: каждый следующий запрос уходит на следующий адрес по кругу.
// Если адрес вернул ошибку подключения, он на время «в карантине» и пропускается:
// так упавший экземпляр сервиса не получает каждый второй запрос.

const DOWN_FOR_MS = 10_000;

export interface Balancer {
  next: () => string;
  markDown: (target: unknown) => void;
}

// Приводим адрес к виду http://host:port. В ошибке прокси адрес приходит
// объектом (у него есть поле href), а из настроек - обычной строкой.
const origin = (target: unknown): string => {
  const text =
    typeof target === 'object' && target !== null && 'href' in target
      ? String((target as { href: unknown }).href)
      : String(target);
  try {
    return new URL(text).origin;
  } catch {
    return text;
  }
};

export function roundRobin(urls: string[]): Balancer {
  let index = 0;
  const downUntil = new Map<string, number>();

  return {
    next: () => {
      const now = Date.now();
      // Пробуем не больше раз, чем адресов; ищем первый «живой»
      for (let i = 0; i < urls.length; i++) {
        const url = urls[index % urls.length];
        index = (index + 1) % urls.length;
        if ((downUntil.get(origin(url)) ?? 0) <= now) return url;
      }
      // Все в карантине: лучше попробовать любой, чем отвечать ошибкой заранее
      const url = urls[index % urls.length];
      index = (index + 1) % urls.length;
      return url;
    },
    markDown: (target) => {
      downUntil.set(origin(target), Date.now() + DOWN_FOR_MS);
    },
  };
}
