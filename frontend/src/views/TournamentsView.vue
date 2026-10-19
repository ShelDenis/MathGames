<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'

const API_URL = 'http://localhost:3001/api'

interface Team { id: string; name: string }
interface Tournament {
  id: string
  name: string
  description: string | null
  status: string
  teams: Team[]
  _count?: { teams: number }
}

const tournaments = ref<Tournament[]>([])
const newTournament = ref({ name: '', description: '' })
const newTeam = ref<{ tournamentId: string; name: string }>({ tournamentId: '', name: '' })

const load = async () => {
  const { data } = await axios.get(`${API_URL}/tournaments`)
  tournaments.value = data
}

const createTournament = async () => {
  await axios.post(`${API_URL}/tournaments`, newTournament.value)
  newTournament.value = { name: '', description: '' }
  await load()
}

const createTeam = async (tournamentId: string) => {
  await axios.post(`${API_URL}/teams`, { ...newTeam.value, tournamentId })
  newTeam.value = { tournamentId: '', name: '' }
  await load()
}

const changeStatus = async (id: string, action: 'start' | 'finish') => {
  await axios.post(`${API_URL}/tournaments/${id}/${action}`)
  await load()
}

onMounted(load)
</script>

<template>
  <div class="p-8 max-w-5xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">🏆 Турниры</h1>

    <!-- Форма создания турнира -->
    <form @submit.prevent="createTournament" class="mb-8 p-6 bg-blue-50 rounded-lg">
      <h2 class="text-xl font-semibold mb-4">Создать турнир</h2>
      <input v-model="newTournament.name" placeholder="Название" class="w-full p-2 mb-2 border rounded" required />
      <textarea v-model="newTournament.description" placeholder="Описание" class="w-full p-2 mb-2 border rounded" rows="2" />
      <button class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Создать турнир</button>
    </form>

    <!-- Список турниров -->
    <div class="space-y-6">
      <div v-for="t in tournaments" :key="t.id" class="border rounded-lg p-6">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-xl font-bold">{{ t.name }}</h3>
            <p v-if="t.description" class="text-gray-600">{{ t.description }}</p>
          </div>
          <div class="flex gap-2">
            <span class="px-3 py-1 rounded text-sm font-semibold"
              :class="{
                'bg-gray-200': t.status === 'DRAFT',
                'bg-green-200 text-green-800': t.status === 'ACTIVE',
                'bg-blue-200 text-blue-800': t.status === 'FINISHED'
              }">
              {{ t.status }}
            </span>
            <button v-if="t.status === 'DRAFT'" @click="changeStatus(t.id, 'start')"
              class="bg-green-600 text-white px-3 py-1 rounded text-sm">▶ Старт</button>
            <button v-if="t.status === 'ACTIVE'" @click="changeStatus(t.id, 'finish')"
              class="bg-gray-600 text-white px-3 py-1 rounded text-sm">⏹ Завершить</button>
          </div>
        </div>

        <!-- Команды -->
        <div class="mt-4">
          <h4 class="font-semibold mb-2">Команды ({{ t.teams.length }}):</h4>
          <ul class="space-y-1 mb-3">
            <li v-for="team in t.teams" :key="team.id" class="bg-gray-50 p-2 rounded">
              👥 {{ team.name }}
            </li>
          </ul>

          <form @submit.prevent="createTeam(t.id)" class="flex gap-2">
            <input v-model="newTeam.name" placeholder="Название команды" class="flex-1 p-2 border rounded" required />
            <button class="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">+ Команда</button>
          </form>
        </div>
      </div>

      <div v-if="tournaments.length === 0" class="text-center text-gray-500 py-8">
        Пока нет турниров. Создайте первый! ☝️
      </div>
    </div>
  </div>
</template>