<script setup lang="ts">
// Оптимизированный интерфейс жюри (Участник 3):
//  • 1 судья = 1 турнир: выбор турнира запоминается, очередь фильтруется на сервере;
//  • минимум кликов: большая фотография, две крупные кнопки, горячие клавиши 1/2;
//  • можно вернуться и поправить вердикт (вкладка «Проверено», PATCH /score);
//  • таймер скорости: темп за последнюю минуту и среднее время на работу.
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { io, Socket } from 'socket.io-client'
import { api, BASE_URL } from '../api'

interface Task { id: string; title: string; maxPoints: number; code: string | null }
interface Team { id: string; name: string; tournamentId?: string }
interface Submission {
  id: string
  taskId: string
  teamId: string
  multiplier: number
  points: number
  status: string
  isManual?: boolean
  createdAt: string
  updatedAt?: string
  task: Task
  team: Team
  image: { id: string; filePath: string; thumbnailPath: string | null } | null
}
interface Tournament { id: string; name: string; teams?: Team[] }

const tournaments = ref<Tournament[]>([])
const selectedTournamentId = ref<string>(localStorage.getItem('jury_tournament') || '')
const currentTeams = computed<Team[]>(
  () => tournaments.value.find((t) => t.id === selectedTournamentId.value)?.teams ?? []
)
const pending = ref<Submission[]>([])
const scored = ref<Submission[]>([])
const selected = ref<Submission | null>(null)
const mode = ref<'queue' | 'done'>('queue')
const nowTick = ref(Date.now())
let socket: Socket
let timer: number | undefined

const imageUrl = (sub: Submission | null) =>
  sub?.image?.filePath ? `${BASE_URL}/uploads/${sub.image.filePath}` : ''

const maxPointsOf = (sub: Submission) => sub.task.maxPoints * sub.multiplier
const scoredAtMs = (s: Submission) => Date.parse(s.updatedAt || s.createdAt)

// Метрики скорости работы жюри для защиты проекта
const avgSeconds = computed(() => {
  const durations = scored.value
    .slice(0, 20)
    .map((s) => Math.max(0, (scoredAtMs(s) - Date.parse(s.createdAt)) / 1000))
  return durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null
})

const perMinute = computed(() => {
  void nowTick.value
  return scored.value.filter((s) => scoredAtMs(s) >= Date.now() - 60_000).length
})

const loadTournaments = async () => {
  const { data } = await api.get('/tournaments')
  tournaments.value = data
  if (!selectedTournamentId.value && data.length > 0) {
    selectedTournamentId.value = data[0].id
  }
}

const loadQueue = async () => {
  if (!selectedTournamentId.value) {
    pending.value = []
    scored.value = []
    return
  }
  // Автофильтр «1 судья = 1 турнир»: сервер возвращает только работы выбранного турнира
  const params = { tournamentId: selectedTournamentId.value }
  const [{ data: pend }, { data: done }] = await Promise.all([
    api.get('/submissions/pending', { params }),
    api.get('/scoreboard').catch(() => ({ data: [] as Submission[] })),
  ])
  pending.value = pend
  const teamIds = new Set(
    (currentTeams.value || []).map((t: Team) => t.id)
  )
  scored.value = (done as Submission[]).filter((s) => teamIds.size === 0 || teamIds.has(s.teamId))
  if (mode.value === 'queue' && selected.value && !pend.find((s: Submission) => s.id === selected.value!.id)) {
    selected.value = null // работу оценили с другого устройства
  }
}

const selectSubmission = (sub: Submission) => {
  mode.value = 'queue'
  selected.value = sub
}

const score = async (isCorrect: boolean) => {
  if (!selected.value) return
  const current = selected.value
  try {
    await api.post(`/submissions/${current.id}/score`, {
      points: isCorrect ? maxPointsOf(current) : 0,
    })
    // Автоматический переход к следующей работе — минимум кликов
    const idx = pending.value.findIndex((s) => s.id === current.id)
    pending.value.splice(idx, 1)
    selected.value = pending.value[Math.min(idx, pending.value.length - 1)] ?? null
    loadQueue()
  } catch (error) {
    console.error('Ошибка выставления баллов:', error)
    alert('Не удалось сохранить результат')
  }
}

// Исправить вердикт: открываем проверенную работу и меняем оценку через PATCH
const reopen = (sub: Submission) => {
  mode.value = 'done'
  selected.value = sub
}

const fixVerdict = async (isCorrect: boolean) => {
  if (!selected.value) return
  try {
    await api.patch(`/submissions/${selected.value.id}/score`, {
      points: isCorrect ? maxPointsOf(selected.value) : 0,
    })
    selected.value = null
    loadQueue()
  } catch (error) {
    console.error('Ошибка исправления вердикта:', error)
    alert('Не удалось исправить вердикт')
  }
}

const moveSelection = (delta: number) => {
  if (pending.value.length === 0) return
  const idx = pending.value.findIndex((s) => s.id === selected.value?.id)
  const next = idx + delta
  if (next < 0 || next >= pending.value.length) return
  selectSubmission(pending.value[next])
}

const onKeydown = (e: KeyboardEvent) => {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  if (e.key === '1') { (mode.value === 'queue' ? score : fixVerdict)(true); e.preventDefault() }
  if (e.key === '2') { (mode.value === 'queue' ? score : fixVerdict)(false); e.preventDefault() }
  if (e.key === 'ArrowDown' || e.key === 'j') { moveSelection(1); e.preventDefault() }
  if (e.key === 'ArrowUp' || e.key === 'k') { moveSelection(-1); e.preventDefault() }
}

const onTournamentChange = () => {
  localStorage.setItem('jury_tournament', selectedTournamentId.value)
  selected.value = null
  loadQueue()
}

onMounted(async () => {
  await loadTournaments()
  await loadQueue()

  socket = io(BASE_URL)
  socket.on('new_submission', loadQueue)
  socket.on('scoreboard_updated', loadQueue)

  window.addEventListener('keydown', onKeydown)
  timer = window.setInterval(() => (nowTick.value = Date.now()), 5000)
})

onUnmounted(() => {
  socket?.disconnect()
  window.removeEventListener('keydown', onKeydown)
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-121px)]">
    <!-- Панель: турнир + метрики -->
    <div class="flex items-center gap-4 px-4 py-2 bg-white border-b flex-wrap">
      <h1 class="text-xl font-bold">👨‍⚖️ Проверка работ</h1>
      <select v-model="selectedTournamentId" @change="onTournamentChange"
              class="p-2 border rounded bg-white text-sm">
        <option v-for="t in tournaments" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <div class="ml-auto flex gap-3 text-sm">
        <span class="px-3 py-1 rounded-full"
              :class="perMinute >= 5 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'">
          🚀 {{ perMinute }} раб./мин за последнюю минуту
        </span>
        <span v-if="avgSeconds !== null" class="px-3 py-1 rounded-full bg-blue-50 text-blue-800">
          ⏱︎ в среднем {{ avgSeconds }} c на работу
        </span>
      </div>
    </div>

    <div class="flex flex-1 overflow-hidden">
      <!-- Левая панель: очередь / проверено -->
      <div class="w-1/3 border-r overflow-y-auto bg-white">
        <div class="flex border-b text-sm sticky top-0 bg-white z-10">
          <button @click="mode = 'queue'"
                  :class="['flex-1 py-2 font-semibold', mode === 'queue' ? 'bg-blue-100 text-blue-700' : 'text-gray-500']">
            Очередь: {{ pending.length }}
          </button>
          <button @click="mode = 'done'"
                  :class="['flex-1 py-2 font-semibold', mode === 'done' ? 'bg-blue-100 text-blue-700' : 'text-gray-500']">
            Проверено
          </button>
        </div>

        <template v-if="mode === 'queue'">
          <div v-for="sub in pending" :key="sub.id"
               @click="selectSubmission(sub)"
               class="p-3 border-b cursor-pointer hover:bg-blue-50"
               :class="{ 'bg-blue-100': selected?.id === sub.id }">
            <div class="flex justify-between items-center">
              <span class="font-bold">{{ sub.task.code ?? '—' }}</span>
              <span class="text-xs text-gray-500">×{{ sub.multiplier }}</span>
            </div>
            <div class="text-sm truncate">{{ sub.team.name }}</div>
            <div v-if="sub.isManual" class="text-xs text-orange-600 mt-1">✍️ ручная заявка</div>
          </div>
          <p v-if="pending.length === 0" class="p-4 text-gray-500 text-sm text-center">
            Очередь пуста — выберите турнир выше
          </p>
        </template>

        <template v-else>
          <div v-for="sub in scored" :key="sub.id"
               @click="reopen(sub)"
               class="p-3 border-b cursor-pointer hover:bg-yellow-50"
               :class="{ 'bg-yellow-100': selected?.id === sub.id }">
            <div class="flex justify-between items-center">
              <span class="font-bold">{{ sub.task.code ?? '—' }}</span>
              <span :class="sub.points > 0 ? 'text-green-700' : 'text-red-700'" class="font-bold text-sm">
                {{ sub.points }}/{{ maxPointsOf(sub) }}
              </span>
            </div>
            <div class="text-sm truncate">{{ sub.team.name }}</div>
          </div>
          <p v-if="scored.length === 0" class="p-4 text-gray-500 text-sm text-center">Пока ничего не проверено</p>
        </template>
      </div>

      <!-- Правая панель: крупное фото + две кнопки -->
      <div class="w-2/3 flex flex-col bg-gray-50">
        <div v-if="selected" class="flex-1 p-4 overflow-y-auto flex flex-col">
          <img v-if="selected.image?.filePath" :src="imageUrl(selected)"
               class="max-h-[55vh] mx-auto rounded border shadow bg-white object-contain" alt="Бланк" />
          <div v-else class="text-center text-gray-400 py-10">Фото нет — заявка создана вручную</div>
          <div class="mt-3 text-center">
            <h3 class="text-xl font-semibold" :title="selected.task.title">
              {{ selected.task.code }} · {{ selected.task.title }}
            </h3>
            <p class="text-gray-600">
              {{ selected.team.name }} · ×{{ selected.multiplier }} · максимум {{ maxPointsOf(selected) }} б.
            </p>
            <p v-if="mode === 'done'" class="text-xs text-amber-600 mt-1">
              Работа уже оценена — новый вердикт заменит предыдущий
            </p>
          </div>
        </div>
        <div v-else class="flex-1 flex items-center justify-center text-gray-500">
          Выберите работу из очереди (↑/↓ — навигация)
        </div>

        <!-- Кнопки вердикта -->
        <div v-if="selected" class="border-t p-4 flex gap-4 bg-white">
          <button @click="mode === 'queue' ? score(false) : fixVerdict(false)"
                  class="flex-1 bg-red-600 text-white py-6 text-2xl font-bold rounded-lg hover:bg-red-700 active:scale-95 transition">
            ❌ НЕВЕРНО (2)
          </button>
          <button @click="mode === 'queue' ? score(true) : fixVerdict(true)"
                  class="flex-1 bg-green-600 text-white py-6 text-2xl font-bold rounded-lg hover:bg-green-700 active:scale-95 transition">
            ✅ ВЕРНО (1)
          </button>
        </div>
        <div v-else class="border-t p-4 bg-white text-center text-sm text-gray-500">
          Горячие клавиши: <kbd class="px-1 bg-gray-200 rounded">1</kbd> верно ·
          <kbd class="px-1 bg-gray-200 rounded">2</kbd> неверно ·
          <kbd class="px-1 bg-gray-200 rounded">↑</kbd>/<kbd class="px-1 bg-gray-200 rounded">↓</kbd> навигация
        </div>
      </div>
    </div>
  </div>
</template>
