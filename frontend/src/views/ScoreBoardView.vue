<script setup lang="ts">
// Компактное табло (Участник 3):
//  • ячейки 40×40, мелкий шрифт, горизонтальная прокрутка при большом числе задач;
//  • вместо названий задач — короткие коды T001…, полное название по наведению (tooltip);
//  • цветовая индикация результата без текста.
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { io, Socket } from 'socket.io-client'
import { api, BASE_URL } from '../api'

interface Task { id: string; title: string; maxPoints: number; code: string | null }
interface Team { id: string; name: string }
interface Submission {
  id: string
  teamId: string
  taskId: string
  points: number
  status: string
  appeal?: { status: string } | null
}
interface Tournament { id: string; name: string; teams: Team[]; tasks: Task[] }

const tournaments = ref<Tournament[]>([])
const selectedTournamentId = ref('')
const teams = ref<Team[]>([])
const tasks = ref<Task[]>([])
const submissions = ref<Submission[]>([])

// Состояние для модального окна апелляции
const showAppealModal = ref(false)
const selectedSub = ref<(Submission & { task?: Task }) | null>(null)
const appealReason = ref('')

// Код задачи или прочерк, если код ещё не назначен
const taskCode = (task: Task) => task.code ?? '—'

// Матрица: teamId -> taskId -> submission
const scoreboard = computed(() => {
  const matrix: Record<string, Record<string, Submission>> = {}
  teams.value.forEach((team) => {
    matrix[team.id] = {}
    tasks.value.forEach((task) => {
      const sub = submissions.value.find((s) => s.teamId === team.id && s.taskId === task.id)
      if (sub) matrix[team.id][task.id] = sub
    })
  })
  return matrix
})

// Строки в порядке суммы баллов — нагляднее, чем порядок регистрации
const rankedTeams = computed(() =>
  [...teams.value].sort((a, b) => getTotalPoints(b.id) - getTotalPoints(a.id))
)

const getTotalPoints = (teamId: string) =>
  Object.values(scoreboard.value[teamId] || {}).reduce((sum, sub) => sum + (sub.points || 0), 0)

// Цветовая индикация без текста: фон ячейки = результат
const getCellClass = (sub?: Submission) => {
  if (!sub) return 'bg-gray-50'
  if (sub.status === 'APPEALED') return 'bg-yellow-200'
  if (sub.status === 'RESOLVED' && sub.appeal?.status === 'ACCEPTED') return 'bg-green-300 ring-2 ring-green-700'
  if (sub.status === 'RESOLVED' && sub.appeal?.status === 'REJECTED') return 'bg-red-300 ring-2 ring-red-700'
  if (sub.points > 0) return 'bg-green-100'
  return 'bg-red-100'
}

const cellTitle = (team: Team, task: Task, sub?: Submission) => {
  const base = `${task.title} (${task.maxPoints} б.) — ${team.name}`
  if (!sub) return base + ': нет заявки'
  const appeal = sub.appeal ? `, апелляция: ${sub.appeal.status}` : ''
  return `${base}: ${sub.points} б., статус ${sub.status}${appeal}`
}

// Логика апелляции
const openAppeal = (sub: Submission) => {
  const task = tasks.value.find((t) => t.id === sub.taskId)
  selectedSub.value = { ...sub, task }
  appealReason.value = ''
  showAppealModal.value = true
}

const submitAppeal = async () => {
  if (!selectedSub.value || !appealReason.value) return
  try {
    await api.post(`/submissions/${selectedSub.value.id}/appeal`, { reason: appealReason.value })
    showAppealModal.value = false
    await loadData()
  } catch (error) {
    console.error('Ошибка подачи апелляции:', error)
    alert('Не удалось подать апелляцию')
  }
}

const loadTournaments = async () => {
  const { data } = await api.get('/tournaments')
  tournaments.value = data
  if (data.length > 0) selectedTournamentId.value = data[0].id
}

const loadData = async () => {
  if (!selectedTournamentId.value) return
  try {
    const { data: tournament } = await api.get(`/tournaments/${selectedTournamentId.value}`)
    teams.value = tournament.teams || []
    tasks.value = tournament.tasks || []

    const { data: subs } = await api.get('/scoreboard')
    submissions.value = subs
  } catch (error) {
    console.error('Ошибка загрузки данных табло:', error)
  }
}

watch(selectedTournamentId, () => loadData())

onMounted(() => {
  loadTournaments()
  loadData()
  socket = io(BASE_URL)
  socket.on('scoreboard_updated', loadData)
})

onUnmounted(() => socket?.disconnect())
</script>

<template>
  <div class="p-8 max-w-7xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">🏆 Табло результатов</h1>

    <div class="mb-6 p-4 bg-gray-50 rounded-lg">
      <label class="block font-semibold mb-2">Турнир:</label>
      <select v-model="selectedTournamentId" class="w-full p-3 border rounded bg-white">
        <option v-for="t in tournaments" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
    </div>

    <div v-if="tasks.length > 0 && teams.length > 0" class="overflow-x-auto">
      <!-- compact-таблица: фикс. колонка команд + горизонтальный скролл задач -->
      <table class="border-collapse text-[11px] leading-tight">
        <thead>
          <tr class="bg-gray-200">
            <th class="border p-1 text-left min-w-[140px] max-w-[140px] sticky left-0 bg-gray-200 z-10">Команда</th>
            <th v-for="task in tasks" :key="task.id"
                class="border p-1 text-center w-10 min-w-10 font-mono font-bold cursor-help"
                :title="`${task.code ?? 'без кода'}: ${task.title} (макс. ${task.maxPoints} б.)`">
              {{ taskCode(task) }}
            </th>
            <th class="border p-1 text-center bg-blue-200 font-bold w-12 min-w-12">Σ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(team, idx) in rankedTeams" :key="team.id" class="hover:bg-gray-50">
            <td class="border p-1 font-semibold truncate max-w-[140px] sticky left-0 bg-white z-10"
                :title="team.name">
              <span class="text-gray-400 mr-1">{{ idx + 1 }}.</span>{{ team.name }}
            </td>

            <!-- Ячейка 40×40: цвет = результат, клик по оценённой = апелляция -->
            <td v-for="task in tasks" :key="task.id"
                :class="['border h-10 w-10 min-w-10 text-center align-middle relative cursor-help',
                         getCellClass(scoreboard[team.id]?.[task.id])]"
                :title="cellTitle(team, task, scoreboard[team.id]?.[task.id])">
              <template v-if="scoreboard[team.id]?.[task.id]">
                <span class="font-bold">{{ scoreboard[team.id][task.id].points }}</span>
                <button
                  v-if="scoreboard[team.id][task.id].status === 'SCORED'"
                  @click="openAppeal(scoreboard[team.id][task.id])"
                  class="absolute top-0 right-0 text-[9px] opacity-50 hover:opacity-100 hover:scale-125 transition"
                  title="Подать апелляцию"
                >⚖️</button>
                <span v-else-if="scoreboard[team.id][task.id].status === 'APPEALED'"
                      class="absolute bottom-0 left-0 text-[8px]">⏳</span>
                <span v-else-if="scoreboard[team.id][task.id].status === 'RESOLVED'"
                      class="absolute bottom-0 left-0 text-[8px]">
                  {{ scoreboard[team.id][task.id].appeal?.status === 'ACCEPTED' ? '✅' : '❌' }}
                </span>
              </template>
            </td>

            <td class="border p-1 text-center font-bold bg-blue-50">{{ getTotalPoints(team.id) }}</td>
          </tr>
        </tbody>
      </table>

      <!-- Легенда цветовой индикации -->
      <div class="mt-3 flex gap-4 text-xs text-gray-600 flex-wrap">
        <span><span class="inline-block w-3 h-3 bg-green-100 border align-middle mr-1"></span>верно</span>
        <span><span class="inline-block w-3 h-3 bg-red-100 border align-middle mr-1"></span>неверно</span>
        <span><span class="inline-block w-3 h-3 bg-yellow-200 border align-middle mr-1"></span>апелляция</span>
        <span><span class="inline-block w-3 h-3 bg-gray-50 border align-middle mr-1"></span>нет заявки</span>
      </div>
    </div>

    <div v-else-if="tasks.length === 0" class="text-center text-gray-500 py-12 bg-gray-50 rounded-lg">
      <p class="text-lg">В этом турнире еще нет задач</p>
    </div>

    <div v-else-if="teams.length === 0" class="text-center text-gray-500 py-12 bg-gray-50 rounded-lg">
      <p class="text-lg">В этом турнире еще нет команд</p>
    </div>

    <!-- Модальное окно апелляции -->
    <div v-if="showAppealModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div class="bg-white p-6 rounded-lg max-w-md w-full shadow-xl">
        <h3 class="text-xl font-bold mb-2">Подача апелляции</h3>
        <p class="text-sm text-gray-600 mb-4">
          Задача: <strong>{{ selectedSub?.task?.code ? selectedSub.task.code + ': ' : '' }}{{ selectedSub?.task?.title }}</strong><br>
          Текущий балл: <strong>{{ selectedSub?.points }}</strong>
        </p>
        <textarea
          v-model="appealReason"
          placeholder="Опишите, почему решение должно быть пересмотрено..."
          class="w-full p-3 border rounded mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
          rows="4"
        ></textarea>
        <div class="flex gap-2 justify-end">
          <button @click="showAppealModal = false" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Отмена</button>
          <button @click="submitAppeal" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Отправить</button>
        </div>
      </div>
    </div>
  </div>
</template>
