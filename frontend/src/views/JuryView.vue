<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import axios from 'axios'
import { io, Socket } from 'socket.io-client'

const API_URL = 'http://localhost:3001/api'
let socket: Socket

// TODO: Замените на реальный ID турнира из профиля пользователя (auth.user.tournamentId)
const USER_TOURNAMENT_ID = 'current-tournament-id' 

interface Submission {
  id: string; taskId: string; teamId: string; multiplier: number;
  task: { id: string; title: string; code: string; maxPoints: number };
  team: { id: string; name: string };
  image: { id: string; filePath: string };
  points?: number; status: string;
}

const activeTab = ref<'queue' | 'history'>('queue')
const queue = ref<Submission[]>([])
const history = ref<Submission[]>([])
const selected = ref<Submission | null>(null)
const currentIndex = ref(0)

const loadQueue = async () => {
  // В реальном проекте добавьте ?tournamentId=${USER_TOURNAMENT_ID}
  const { data } = await axios.get(`${API_URL}/submissions/pending`)
  queue.value = data
  if (queue.value.length > 0 && !selected.value) selectSub(queue.value[0], 0)
}

const loadHistory = async () => {
  const { data } = await axios.get(`${API_URL}/submissions/scored`) // Эндпоинт должен вернуть проверенные
  history.value = data
}

const selectSub = (sub: Submission, index: number) => {
  selected.value = sub
  currentIndex.value = index
}

const score = async (isCorrect: boolean) => {
  if (!selected.value) return
  const points = isCorrect ? selected.value.task.maxPoints * selected.value.multiplier : 0
  
  try {
    await axios.post(`${API_URL}/submissions/${selected.value.id}/score`, { points })
    queue.value = queue.value.filter(s => s.id !== selected.value!.id)
    if (queue.value.length > 0) {
      selectSub(queue.value[Math.min(currentIndex.value, queue.value.length - 1)], currentIndex.value)
    } else {
      selected.value = null
      loadQueue()
    }
  } catch (e) { console.error(e) }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (activeTab.value !== 'queue' || !selected.value) return
  if (e.key === '1') score(true)
  if (e.key === '2') score(false)
  if (e.key === 'ArrowRight' && currentIndex.value < queue.value.length - 1) selectSub(queue.value[currentIndex.value + 1], currentIndex.value + 1)
  if (e.key === 'ArrowLeft' && currentIndex.value > 0) selectSub(queue.value[currentIndex.value - 1], currentIndex.value - 1)
}

onMounted(() => {
  loadQueue()
  window.addEventListener('keydown', handleKeydown)
  socket = io(API_URL.replace('/api', ''))
  socket.on('new_submission', loadQueue)
})
onUnmounted(() => { window.removeEventListener('keydown', handleKeydown); socket?.disconnect() })
</script>

<template>
  <div class="flex h-screen bg-gray-100 overflow-hidden">
    <!-- Левая панель: Очередь / История -->
    <div class="w-80 flex flex-col border-r bg-white">
      <div class="flex border-b">
        <button @click="activeTab = 'queue'" :class="activeTab === 'queue' ? 'bg-blue-600 text-white' : 'bg-gray-100'" class="flex-1 py-3 font-bold">Очередь ({{ queue.length }})</button>
        <button @click="activeTab = 'history'; loadHistory()" :class="activeTab === 'history' ? 'bg-blue-600 text-white' : 'bg-gray-100'" class="flex-1 py-3 font-bold">История</button>
      </div>
      <div class="flex-1 overflow-y-auto">
        <div v-for="(sub, idx) in (activeTab === 'queue' ? queue : history)" :key="sub.id" 
             @click="selectSub(sub, idx)"
             class="p-3 border-b cursor-pointer hover:bg-blue-50 transition"
             :class="{ 'bg-blue-100 border-l-4 border-l-blue-600': selected?.id === sub.id }">
          <div class="flex items-center gap-2">
            <span class="bg-gray-800 text-white px-2 py-0.5 rounded text-xs font-mono font-bold">{{ sub.task.code }}</span>
            <span class="text-sm font-semibold truncate">{{ sub.team.name }}</span>
          </div>
          <div class="text-xs text-gray-500 mt-1">×{{ sub.multiplier }} • {{ sub.task.title }}</div>
        </div>
        <div v-if="(activeTab === 'queue' ? queue : history).length === 0" class="p-8 text-center text-gray-400">Пусто</div>
      </div>
    </div>

    <!-- Правая панель: Просмотр и кнопки -->
    <div class="flex-1 flex flex-col">
      <div v-if="selected" class="flex-1 p-6 overflow-y-auto flex flex-col items-center">
        <img :src="`${API_URL}/uploads/${selected.image.filePath}`" class="max-h-[60vh] rounded-lg shadow-lg mb-4 border" />
        <div class="bg-white p-4 rounded-lg shadow w-full max-w-2xl flex justify-between items-center">
          <div>
            <div class="flex items-center gap-3">
              <span class="bg-blue-600 text-white px-3 py-1 rounded font-mono font-bold text-lg">{{ selected.task.code }}</span>
              <h3 class="text-xl font-bold">{{ selected.task.title }}</h3>
            </div>
            <p class="text-gray-600 mt-1">{{ selected.team.name }} • Множитель ×{{ selected.multiplier }} • Макс: {{ selected.task.maxPoints * selected.multiplier }}</p>
          </div>
          <div v-if="activeTab === 'history'" class="text-right">
            <div class="text-sm text-gray-500">Текущий балл:</div>
            <div class="text-3xl font-bold" :class="selected.points > 0 ? 'text-green-600' : 'text-red-600'">{{ selected.points }}</div>
          </div>
        </div>
      </div>
      <div v-else class="flex-1 flex items-center justify-center text-gray-400 text-2xl">Выберите работу слева</div>

      <!-- Кнопки (только для очереди) -->
      <div v-if="selected && activeTab === 'queue'" class="border-t bg-white p-4 shadow-lg">
        <div class="max-w-4xl mx-auto flex gap-4">
          <button @click="score(false)" class="flex-1 bg-red-600 text-white py-6 rounded-xl text-2xl font-bold hover:bg-red-700 active:scale-95 transition">❌ НЕВЕРНО <span class="text-sm opacity-75 block">(2)</span></button>
          <button @click="score(true)" class="flex-1 bg-green-600 text-white py-6 rounded-xl text-2xl font-bold hover:bg-green-700 active:scale-95 transition">✅ ВЕРНО <span class="text-sm opacity-75 block">(1)</span></button>
        </div>
        <p class="text-center text-xs text-gray-400 mt-2">Горячие клавиши: 1 / 2 — оценка, ← → — навигация</p>
      </div>
    </div>
  </div>
</template>