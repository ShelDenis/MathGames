<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'

const API_URL = 'http://localhost:3001/api'
const stats = ref({ total: 0, recognized: 0, pending: 0, failed: 0 })
const failedBlanks = ref<any[]>([])

onMounted(async () => {
  // Эндпоинты нужно будет добавить на бэкенде, пока мокаем для UI
  try {
    const { data } = await axios.get(`${API_URL}/dashboard/stats`)
    stats.value = data
    const { data: failed } = await axios.get(`${API_URL}/dashboard/failed`)
    failedBlanks.value = failed
  } catch (e) { console.log('Dashboard API not ready yet') }
})
</script>

<template>
  <div class="p-6 max-w-6xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">📊 Панель мониторинга турнира</h1>
    
    <div class="grid grid-cols-4 gap-4 mb-8">
      <div class="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500"><div class="text-sm text-gray-600">Всего загружено</div><div class="text-3xl font-bold">{{ stats.total }}</div></div>
      <div class="bg-white p-4 rounded-lg shadow border-l-4 border-green-500"><div class="text-sm text-gray-600">Распознано</div><div class="text-3xl font-bold text-green-600">{{ stats.recognized }}</div></div>
      <div class="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-500"><div class="text-sm text-gray-600">В очереди</div><div class="text-3xl font-bold text-yellow-600">{{ stats.pending }}</div></div>
      <div class="bg-white p-4 rounded-lg shadow border-l-4 border-red-500"><div class="text-sm text-gray-600">Ошибок</div><div class="text-3xl font-bold text-red-600">{{ stats.failed }}</div></div>
    </div>

    <div v-if="failedBlanks.length > 0" class="bg-red-50 border-2 border-red-400 rounded-lg p-4 animate-pulse">
      <h3 class="font-bold text-red-800 mb-2 text-lg">⚠️ ТРЕБУЮТ ВНИМАНИЯ: {{ failedBlanks.length }} бланков не распознаны!</h3>
      <div class="space-y-2">
        <div v-for="blank in failedBlanks" :key="blank.id" class="bg-white p-3 rounded flex justify-between items-center shadow-sm">
          <span class="font-mono text-sm">{{ blank.fileName }}</span>
          <button class="bg-red-600 text-white px-4 py-1 rounded text-sm hover:bg-red-700">Ручная проверка</button>
        </div>
      </div>
    </div>
    <div v-else class="bg-green-50 border-2 border-green-400 rounded-lg p-6 text-center">
      <h3 class="font-bold text-green-800 text-xl">✅ Все бланки обработаны успешно. Система работает штатно.</h3>
    </div>
  </div>
</template>