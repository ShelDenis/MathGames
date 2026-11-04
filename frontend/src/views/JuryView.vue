<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import { io, Socket } from 'socket.io-client'

const API_URL = 'http://localhost:3001/api'
let socket: Socket

interface Submission {
  id: string
  taskId: string
  teamId: string
  multiplier: number
  status: string
  task: { id: string; title: string; maxPoints: number }
  team: { id: string; name: string }
  image: { id: string; thumbnailPath: string; filePath: string }
}

const submissions = ref<Submission[]>([])
const selectedSubmission = ref<Submission | null>(null)
const points = ref(0)

const loadSubmissions = async () => {
  const { data } = await axios.get(`${API_URL}/submissions/pending`)
  submissions.value = data
}

const selectSubmission = (sub: Submission) => {
  selectedSubmission.value = sub
  points.value = sub.task.maxPoints * sub.multiplier
}

const scoreSubmission = async (isCorrect: boolean) => {
  if (!selectedSubmission.value) return
  
  // Если правильно — ставим максимум (баллы задачи × множитель), если нет — 0
  const points = isCorrect 
    ? selectedSubmission.value.task.maxPoints * selectedSubmission.value.multiplier 
    : 0

  try {
    await axios.post(`${API_URL}/submissions/${selectedSubmission.value.id}/score`, {
      points: points
    })
    
    selectedSubmission.value = null // Сбрасываем выбор
    await loadSubmissions() // Обновляем очередь
  } catch (error) {
    console.error('Ошибка выставления баллов:', error)
    alert('Не удалось сохранить результат')
  }
}

onMounted(() => {
  loadSubmissions()

  socket = io('http://localhost:3001')
  socket.on('new_submission', () => {
    loadSubmissions()
  })
})

onUnmounted(() => {
  socket?.disconnect()
})
</script>

<template>
  <div class="p-8 max-w-6xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">👨‍⚖️ Проверка работ</h1>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Очередь -->
      <div>
        <h2 class="text-xl font-semibold mb-4">Очередь ({{ submissions.length }})</h2>
        <div class="space-y-2">
          <div
            v-for="sub in submissions"
            :key="sub.id"
            @click="selectSubmission(sub)"
            class="p-4 border rounded cursor-pointer hover:bg-blue-50"
            :class="{ 'bg-blue-100 border-blue-500': selectedSubmission?.id === sub.id }"
          >
            <div class="font-semibold">{{ sub.task.title }}</div>
            <div class="text-sm text-gray-600">
              Команда: {{ sub.team.name }} | Множитель: ×{{ sub.multiplier }}
            </div>
          </div>
        </div>
      </div>

      <!-- Проверка -->
      <div v-if="selectedSubmission">
        <h2 class="text-xl font-semibold mb-4">Проверка</h2>
        <div class="border rounded p-4">
          <img
            :src="`http://localhost:3001/uploads/${selectedSubmission.image.filePath}`"
            class="w-full mb-4 border rounded"
            alt="Бланк"
          />
          <div class="mb-4">
            <strong>Задача:</strong> {{ selectedSubmission.task.title }}<br />
            <strong>Команда:</strong> {{ selectedSubmission.team.name }}<br />
            <strong>Множитель:</strong> ×{{ selectedSubmission.multiplier }}<br />
            <strong>Макс. баллов:</strong> {{ selectedSubmission.task.maxPoints * selectedSubmission.multiplier }}
          </div>

          <!-- Новые кнопки проверки -->
          <div class="flex gap-3 mt-6">
            <button
              @click="scoreSubmission(false)"
              class="flex-1 bg-red-600 text-white py-4 rounded-lg hover:bg-red-700 font-bold text-lg transition shadow-sm"
            >
              ❌ Неправильно
            </button>
            <button
              @click="scoreSubmission(true)"
              class="flex-1 bg-green-600 text-white py-4 rounded-lg hover:bg-green-700 font-bold text-lg transition shadow-sm"
            >
              ✅ Правильно
            </button>
          </div>
        </div>
      </div>
      <div v-else class="text-center text-gray-500 py-12">
        Выберите работу из очереди для проверки
      </div>
    </div>
  </div>
</template>