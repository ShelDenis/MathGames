<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import { io, Socket } from 'socket.io-client'

const API_URL = 'http://localhost:3001/api'
let socket: Socket

interface Task { id: string; title: string }
interface Team { id: string; name: string }

const tasks = ref<Task[]>([])
const teams = ref<Team[]>([])
const selectedTask = ref('')
const selectedTeam = ref('')
const multiplier = ref(1)
const selectedFile = ref<File | null>(null)
const uploadStatus = ref<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle')
const statusMessage = ref('')

const loadTasks = async () => {
  const { data } = await axios.get(`${API_URL}/tasks`)
  tasks.value = data
}

const loadTeams = async () => {
  // Загружаем команды первого турнира (для упрощения)
  const { data: tournaments } = await axios.get(`${API_URL}/tournaments`)
  if (tournaments.length > 0) {
    const { data: teamsData } = await axios.get(`${API_URL}/tournaments/${tournaments[0].id}/teams`)
    teams.value = teamsData
  }
}

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    selectedFile.value = target.files[0]
  }
}

const uploadImage = async () => {
  if (!selectedFile.value || !selectedTask.value || !selectedTeam.value) {
    alert('Выберите файл, задачу и команду')
    return
  }

  uploadStatus.value = 'uploading'
  statusMessage.value = 'Загрузка файла...'

  const formData = new FormData()
  formData.append('image', selectedFile.value)
  formData.append('taskId', selectedTask.value)
  formData.append('teamId', selectedTeam.value)
  formData.append('multiplier', multiplier.value.toString())

  try {
    await axios.post(`${API_URL}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    uploadStatus.value = 'processing'
    statusMessage.value = 'Обработка изображения...'
  } catch (error) {
    uploadStatus.value = 'error'
    statusMessage.value = 'Ошибка загрузки'
  }
}

onMounted(() => {
  loadTasks()
  loadTeams()

  socket = io('http://localhost:3001')
  socket.on('image_processed', (data) => {
    if (data.status === 'ready') {
      uploadStatus.value = 'success'
      statusMessage.value = '✅ Готово! Работа отправлена жюри'
      selectedFile.value = null
    } else if (data.status === 'needs_rescan') {
      uploadStatus.value = 'error'
      statusMessage.value = '⚠️ QR-код не распознан. Переснимите бланк.'
    } else {
      uploadStatus.value = 'error'
      statusMessage.value = '❌ Ошибка обработки'
    }
  })
})

onUnmounted(() => {
  socket?.disconnect()
})
</script>

<template>
  <div class="p-8 max-w-2xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">📸 Загрузка бланков</h1>

    <form @submit.prevent="uploadImage" class="space-y-4">
      <div>
        <label class="block font-semibold mb-2">Задача:</label>
        <select v-model="selectedTask" class="w-full p-3 border rounded" required>
          <option value="">Выберите задачу</option>
          <option v-for="task in tasks" :key="task.id" :value="task.id">
            {{ task.title }}
          </option>
        </select>
      </div>

      <div>
        <label class="block font-semibold mb-2">Команда:</label>
        <select v-model="selectedTeam" class="w-full p-3 border rounded" required>
          <option value="">Выберите команду</option>
          <option v-for="team in teams" :key="team.id" :value="team.id">
            {{ team.name }}
          </option>
        </select>
      </div>

      <div>
        <label class="block font-semibold mb-2">Множитель:</label>
        <select v-model.number="multiplier" class="w-full p-3 border rounded">
          <option :value="1">×1 (стандарт)</option>
          <option :value="2">×2 (уверен)</option>
          <option :value="3">×3 (рискованно)</option>
        </select>
      </div>

      <div>
        <label class="block font-semibold mb-2">Фото бланка:</label>
        <input 
          type="file" 
          accept="image/*" 
          @change="handleFileSelect"
          class="w-full p-3 border rounded"
          required
        />
      </div>

      <button
        type="submit"
        :disabled="uploadStatus === 'uploading' || uploadStatus === 'processing'"
        class="w-full bg-blue-600 text-white py-3 rounded hover:bg-blue-700 disabled:bg-gray-400"
      >
        📤 Загрузить бланк
      </button>

      <div v-if="statusMessage" class="p-4 rounded"
        :class="{
          'bg-blue-100 text-blue-800': uploadStatus === 'uploading' || uploadStatus === 'processing',
          'bg-green-100 text-green-800': uploadStatus === 'success',
          'bg-red-100 text-red-800': uploadStatus === 'error'
        }">
        {{ statusMessage }}
      </div>
    </form>
  </div>
</template>