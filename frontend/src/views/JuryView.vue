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

const scoreSubmission = async () => {
  if (!selectedSubmission.value) return
  
  await axios.post(`${API_URL}/submissions/${selectedSubmission.value.id}/score`, {
    points: points.value
  })
  
  selectedSubmission.value = null
  await loadSubmissions()
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
            <strong>Макс. баллов:</strong> {{ selectedSubmission.task.maxPoints }}
          </div>
          <div class="mb-4">
            <label class="block font-semibold mb-2">Баллы:</label>
            <input
              v-model.number="points"
              type="number"
              :max="selectedSubmission.task.maxPoints * selectedSubmission.multiplier"
              class="w-full p-3 border rounded"
            />
          </div>
          <button
            @click="scoreSubmission"
            class="w-full bg-green-600 text-white py-3 rounded hover:bg-green-700"
          >
            ✅ Выставить баллы
          </button>
        </div>
      </div>
      <div v-else class="text-center text-gray-500 py-12">
        Выберите работу из очереди для проверки
      </div>
    </div>
  </div>
</template>