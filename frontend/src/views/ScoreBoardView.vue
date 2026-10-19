<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import { io, Socket } from 'socket.io-client'

const API_URL = 'http://localhost:3001/api'
let socket: Socket

interface Submission {
  id: string
  points: number
  multiplier: number
  status: string
  task: { id: string; title: string; maxPoints: number }
  team: { id: string; name: string }
  appeal?: { status: string } | null
}

const submissions = ref<Submission[]>([])
const showAppealModal = ref(false)
const selectedSub = ref<Submission | null>(null)
const appealReason = ref('')

const loadScoreboard = async () => {
  const { data } = await axios.get(`${API_URL}/scoreboard`)
  submissions.value = data
}

const openAppeal = (sub: Submission) => {
  selectedSub.value = sub
  appealReason.value = ''
  showAppealModal.value = true
}

const submitAppeal = async () => {
  if (!selectedSub.value || !appealReason.value) return
  await axios.post(`${API_URL}/submissions/${selectedSub.value.id}/appeal`, {
    reason: appealReason.value
  })
  showAppealModal.value = false
  await loadScoreboard()
}

// Определяем классы для квадратика задачи
const getBoxClass = (sub: Submission) => {
  const base = 'w-16 h-16 flex flex-col items-center justify-center rounded font-bold transition-all '
  const isCorrect = sub.points > 0
  
  if (sub.status === 'APPEALED') return base + 'bg-yellow-100 text-yellow-800 border-2 border-yellow-500'
  
  if (sub.status === 'RESOLVED' && sub.appeal?.status === 'ACCEPTED') {
    return base + 'bg-green-100 text-green-800 border-4 border-green-800' // 🟩 Тёмно-зелёная обводка
  }
  if (sub.status === 'RESOLVED' && sub.appeal?.status === 'REJECTED') {
    return base + 'bg-red-100 text-red-800 border-4 border-red-800' // 🟥 Тёмно-красная обводка
  }
  if (isCorrect) {
    return base + 'bg-green-100 text-green-800 border-2 border-green-500' // Обычный 🟩
  }
  return base + 'bg-red-100 text-red-800 border-2 border-red-500' // Обычный 🟥
}

onMounted(() => {
  loadScoreboard()
  socket = io('http://localhost:3001')
  socket.on('scoreboard_updated', loadScoreboard)
})

onUnmounted(() => socket?.disconnect())
</script>

<template>
  <div class="p-8 max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">🏆 Табло результатов</h1>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div v-for="sub in submissions" :key="sub.id" class="p-4 border rounded flex justify-between items-center bg-white shadow-sm">
        <div>
          <div class="font-semibold text-lg">{{ sub.team.name }}</div>
          <div class="text-sm text-gray-600">{{ sub.task.title }}</div>
          <div class="text-xs text-gray-400 mt-1">×{{ sub.multiplier }}</div>
        </div>
        
        <div class="flex flex-col items-end gap-2">
          <div :class="getBoxClass(sub)">
            <span class="text-xl">{{ sub.points }}</span>
            <span class="text-xs">баллов</span>
          </div>
          
          <!-- Кнопка апелляции только для своих работ и если еще не подана -->
          <button 
            v-if="sub.status === 'SCORED'"
            @click="openAppeal(sub)"
            class="text-xs text-blue-600 hover:underline"
          >
            ⚖️ Подать апелляцию
          </button>
          <span v-else-if="sub.status === 'APPEALED'" class="text-xs text-yellow-600 font-semibold">
            ⏳ На рассмотрении
          </span>
          <span v-else-if="sub.status === 'RESOLVED'" class="text-xs text-gray-500">
            {{ sub.appeal?.status === 'ACCEPTED' ? '✅ Апелляция удовлетворена' : '❌ Апелляция отклонена' }}
          </span>
        </div>
      </div>
    </div>

    <!-- Модальное окно апелляции -->
    <div v-if="showAppealModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div class="bg-white p-6 rounded-lg max-w-md w-full">
        <h3 class="text-xl font-bold mb-4">Подача апелляции</h3>
        <p class="text-sm text-gray-600 mb-4">Задача: {{ selectedSub?.task.title }}</p>
        <textarea 
          v-model="appealReason" 
          placeholder="Опишите, почему решение должно быть пересмотрено..." 
          class="w-full p-3 border rounded mb-4" 
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