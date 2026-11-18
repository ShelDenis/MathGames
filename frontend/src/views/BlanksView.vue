<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import axios from 'axios'

const API_URL = 'http://localhost:3001/api'

interface Team { id: string; name: string }
interface Tournament { 
  id: string
  name: string
  teams: Team[]
}

const tournaments = ref<Tournament[]>([])
const selectedTournamentId = ref('')
const selectedTeamId = ref('')
const errorMessage = ref('')

const loadTournaments = async () => {
  console.log('🔄 Загрузка турниров...')
  try {
    const response = await axios.get(`${API_URL}/tournaments`)
    console.log('✅ Ответ сервера:', response.data)
    tournaments.value = response.data
    
    if (tournaments.value.length > 0) {
      selectedTournamentId.value = tournaments.value[0].id
    }
  } catch (error) {
    console.error(' Ошибка:', error)
    errorMessage.value = 'Не удалось загрузить турниры'
  }
}

// 👇 ЯВНО вызываем при монтировании
onMounted(() => {
  console.log(' Компонент BlanksView смонтирован')
  loadTournaments()
})

const generateBlanks = () => {
  if (!selectedTeamId.value) {
    alert('Выберите команду')
    return
  }
  window.open(`${API_URL}/blanks/generate-team?teamId=${selectedTeamId.value}`, '_blank')
}
</script>

<template>
  <div class="p-8 max-w-3xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">🖨️ Печать бланков</h1>

    <div v-if="errorMessage" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
      {{ errorMessage }}
    </div>

    <div class="bg-white p-6 rounded-lg shadow-sm border">
      <div class="mb-4">
        <label class="block font-semibold mb-2">Турнир:</label>
        <select v-model="selectedTournamentId" class="w-full p-2 border rounded">
          <option v-for="t in tournaments" :key="t.id" :value="t.id">
            {{ t.name }} ({{ t.teams?.length || 0 }} команд)
          </option>
        </select>
      </div>

      <div class="mb-6">
        <label class="block font-semibold mb-2">Команда:</label>
        <select v-model="selectedTeamId" class="w-full p-2 border rounded">
          <option value="">-- Выберите --</option>
          <option 
            v-for="team in tournaments.find(t => t.id === selectedTournamentId)?.teams || []" 
            :key="team.id" 
            :value="team.id"
          >
            {{ team.name }}
          </option>
        </select>
      </div>

      <button 
        @click="generateBlanks"
        :disabled="!selectedTeamId"
        class="w-full bg-indigo-600 text-white py-3 rounded disabled:bg-gray-300"
      >
        Скачать PDF
      </button>
    </div>
  </div>
</template>