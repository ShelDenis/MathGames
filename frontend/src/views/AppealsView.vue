<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import { io, Socket } from 'socket.io-client'

const API_URL = 'http://localhost:3001/api'
let socket: Socket

interface Appeal {
  id: string
  reason: string
  submission: {
    id: string
    points: number
    multiplier: number
    task: { title: string; maxPoints: number }
    team: { name: string }
    image: { filePath: string }
  }
}

const appeals = ref<Appeal[]>([])
const newPoints = ref(0)

const loadAppeals = async () => {
  const { data } = await axios.get(`${API_URL}/appeals/pending`)
  appeals.value = data
}

const resolveAppeal = async (appealId: string, action: 'ACCEPTED' | 'REJECTED') => {
  await axios.post(`${API_URL}/appeals/${appealId}/resolve`, {
    action,
    newPoints: action === 'ACCEPTED' ? newPoints.value : 0
  })
  await loadAppeals()
}

onMounted(() => {
  loadAppeals()
  socket = io('http://localhost:3001')
  socket.on('new_appeal', loadAppeals)
})

onUnmounted(() => socket?.disconnect())
</script>

<template>
  <div class="p-8 max-w-5xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">⚖️ Рассмотрение апелляций</h1>

    <div v-if="appeals.length === 0" class="text-center text-gray-500 py-12">
      Очередь апелляций пуста 🎉
    </div>

    <div class="space-y-6">
      <div v-for="appeal in appeals" :key="appeal.id" class="border rounded-lg p-6 bg-white shadow-sm">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-xl font-bold">{{ appeal.submission.task.title }}</h3>
            <p class="text-gray-600">Команда: {{ appeal.submission.team.name }}</p>
            <p class="text-sm text-gray-500">Текущие баллы: {{ appeal.submission.points }} (×{{ appeal.submission.multiplier }})</p>
          </div>
          <img 
            :src="`http://localhost:3001/uploads/${appeal.submission.image.filePath}`" 
            class="w-32 h-32 object-cover border rounded cursor-pointer hover:opacity-80"
            title="Нажмите, чтобы открыть в полном размере"
            @click="window.open(`http://localhost:3001/uploads/${appeal.submission.image.filePath}`, '_blank')"
          />
        </div>

        <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
          <p class="font-semibold text-yellow-800">Аргументация ученика:</p>
          <p class="text-yellow-900 whitespace-pre-wrap">{{ appeal.reason }}</p>
        </div>

        <div class="flex gap-4 items-end">
          <div class="flex-1">
            <label class="block text-sm font-semibold mb-1">Новые баллы (если принять):</label>
            <input 
              v-model.number="newPoints" 
              type="number" 
              :max="appeal.submission.task.maxPoints * appeal.submission.multiplier"
              class="w-full p-2 border rounded"
            />
          </div>
          <button 
            @click="resolveAppeal(appeal.id, 'REJECTED')"
            class="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold"
          >
            ❌ Отклонить
          </button>
          <button 
            @click="resolveAppeal(appeal.id, 'ACCEPTED')"
            class="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold"
          >
            ✅ Принять
          </button>
        </div>
      </div>
    </div>
  </div>
</template>