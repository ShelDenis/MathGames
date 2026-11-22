<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'

const API_URL = 'http://localhost:3001/api'
const tasks = ref<any[]>([])
const teams = ref<any[]>([])
const submissions = ref<any[]>([])

const scoreboard = computed(() => {
  const matrix: any = {}
  teams.value.forEach(t => { matrix[t.id] = {}; tasks.value.forEach(task => { const s = submissions.value.find(sub => sub.teamId === t.id && sub.taskId === task.id); if (s) matrix[t.id][task.id] = s; }) })
  return matrix
})

const getCellClass = (sub: any) => {
  if (!sub) return 'bg-gray-100 text-gray-300'
  if (sub.status === 'APPEALED') return 'bg-yellow-200 text-yellow-900'
  if (sub.points > 0) return 'bg-green-500 text-white'
  return 'bg-red-500 text-white'
}

onMounted(async () => {
  const [tRes, tmRes, sRes] = await Promise.all([
    axios.get(`${API_URL}/tasks`), axios.get(`${API_URL}/tournaments/first/teams`), axios.get(`${API_URL}/scoreboard`)
  ])
  tasks.value = tRes.data; teams.value = tmRes.data; submissions.value = sRes.data
})
</script>

<template>
  <div class="p-4 max-w-full mx-auto">
    <h1 class="text-2xl font-bold mb-4">🏆 Табло результатов</h1>
    <div class="overflow-x-auto shadow-lg rounded-lg border">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="bg-gray-800 text-white">
            <th class="border border-gray-600 p-2 text-left sticky left-0 bg-gray-800 z-10 min-w-[120px]">Команда</th>
            <th v-for="task in tasks" :key="task.id" class="border border-gray-600 p-1 text-center min-w-[40px]" :title="task.title">
              <div class="text-xs font-mono font-bold">{{ task.code }}</div>
            </th>
            <th class="border border-gray-600 p-2 text-center bg-blue-900 font-bold min-w-[60px]">Σ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="team in teams" :key="team.id" class="hover:bg-gray-50">
            <td class="border border-gray-300 p-2 font-semibold sticky left-0 bg-white z-10">{{ team.name }}</td>
            <td v-for="task in tasks" :key="task.id" :class="['border border-gray-300 p-1 text-center text-xs font-bold', getCellClass(scoreboard[team.id]?.[task.id])]">
              {{ scoreboard[team.id]?.[task.id]?.points ?? '' }}
            </td>
            <td class="border border-gray-300 p-2 text-center font-bold bg-blue-50 text-lg">
              {{ Object.values(scoreboard[team.id] || {}).reduce((sum: number, s: any) => sum + (s.points || 0), 0) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>