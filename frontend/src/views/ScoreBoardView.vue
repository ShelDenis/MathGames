<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import axios from 'axios'
import { io, Socket } from 'socket.io-client'

const API_URL = 'http://localhost:3001/api'
let socket: Socket

interface Task { id: string; title: string; maxPoints: number }
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
const selectedSub = ref<Submission | null>(null)
const appealReason = ref('')

// Матрица: teamId -> taskId -> submission
const scoreboard = computed(() => {
  const matrix: Record<string, Record<string, Submission>> = {}
  teams.value.forEach(team => {
    matrix[team.id] = {}
    tasks.value.forEach(task => {
      const sub = submissions.value.find(s => s.teamId === team.id && s.taskId === task.id)
      if (sub) matrix[team.id][task.id] = sub
    })
  })
  return matrix
})

const getTotalPoints = (teamId: string) => {
  return Object.values(scoreboard.value[teamId] || {}).reduce((sum, sub) => sum + (sub.points || 0), 0)
}

const getCellClass = (sub?: Submission) => {
  if (!sub) return 'bg-gray-100 text-gray-400'
  if (sub.status === 'APPEALED') return 'bg-yellow-100 text-yellow-800 border-2 border-yellow-500'
  if (sub.status === 'RESOLVED' && sub.appeal?.status === 'ACCEPTED') return 'bg-green-100 text-green-800 border-4 border-green-800'
  if (sub.status === 'RESOLVED' && sub.appeal?.status === 'REJECTED') return 'bg-red-100 text-red-800 border-4 border-red-800'
  if (sub.points > 0) return 'bg-green-100 text-green-800'
  return 'bg-red-100 text-red-800'
}

// Логика апелляции
const openAppeal = (sub: Submission) => {
  selectedSub.value = sub
  appealReason.value = ''
  showAppealModal.value = true
}

const submitAppeal = async () => {
  if (!selectedSub.value || !appealReason.value) return
  try {
    await axios.post(`${API_URL}/submissions/${selectedSub.value.id}/appeal`, {
      reason: appealReason.value
    })
    showAppealModal.value = false
    await loadData() // Обновляем данные
  } catch (error) {
    console.error('Ошибка подачи апелляции:', error)
    alert('Не удалось подать апелляцию')
  }
}

const loadTournaments = async () => {
  const { data } = await axios.get(`${API_URL}/tournaments`)
  tournaments.value = data
  if (data.length > 0) selectedTournamentId.value = data[0].id
}

const loadData = async () => {
  if (!selectedTournamentId.value) return
  try {
    const { data: tournament } = await axios.get(`${API_URL}/tournaments/${selectedTournamentId.value}`)
    teams.value = tournament.teams || []
    tasks.value = tournament.tasks || []
    
    const { data: subs } = await axios.get(`${API_URL}/scoreboard`)
    submissions.value = subs
  } catch (error) {
    console.error('Ошибка загрузки данных табло:', error)
  }
}

watch(selectedTournamentId, () => loadData())

onMounted(() => {
  loadTournaments()
  loadData()
  socket = io('http://localhost:3001')
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
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-gray-200">
            <th class="border p-3 text-left min-w-[150px]">Команда</th>
            <th v-for="task in tasks" :key="task.id" class="border p-3 text-center min-w-[100px]">
              <div class="text-sm font-semibold">{{ task.title }}</div>
              <div class="text-xs text-gray-600">×{{ task.maxPoints }}</div>
            </th>
            <th class="border p-3 text-center bg-blue-200 font-bold min-w-[100px]">Итого</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="team in teams" :key="team.id" class="hover:bg-gray-50">
            <td class="border p-3 font-semibold">{{ team.name }}</td>
            
            <!-- Ячейка с баллами и кнопкой апелляции -->
            <td 
              v-for="task in tasks" 
              :key="task.id"
              :class="['border p-2 text-center relative', getCellClass(scoreboard[team.id]?.[task.id])]"
            >
              <div v-if="scoreboard[team.id]?.[task.id]" class="flex flex-col items-center justify-center">
                <span class="text-lg font-bold">{{ scoreboard[team.id][task.id].points }}</span>
                
                <!-- Кнопка апелляции (появляется только если статус SCORED) -->
                <button
                  v-if="scoreboard[team.id][task.id].status === 'SCORED'"
                  @click="openAppeal(scoreboard[team.id][task.id])"
                  class="absolute top-1 right-1 text-xs opacity-60 hover:opacity-100 hover:scale-125 transition"
                  title="Подать апелляцию"
                >
                  ⚖️
                </button>
                
                <!-- Статусы -->
                <span v-else-if="scoreboard[team.id][task.id].status === 'APPEALED'" class="text-[10px] font-bold mt-1">⏳ ЖДЕТ</span>
                <span v-else-if="scoreboard[team.id][task.id].status === 'RESOLVED'" class="text-[10px] font-bold mt-1">
                  {{ scoreboard[team.id][task.id].appeal?.status === 'ACCEPTED' ? '✅' : '❌' }}
                </span>
              </div>
              <span v-else class="text-gray-300">-</span>
            </td>

            <td class="border p-3 text-center font-bold bg-blue-50 text-lg">
              {{ getTotalPoints(team.id) }}
            </td>
          </tr>
        </tbody>
      </table>
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
          Задача: <strong>{{ selectedSub?.task?.title }}</strong><br>
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