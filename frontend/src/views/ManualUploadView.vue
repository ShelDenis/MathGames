<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'

const API_URL = 'http://localhost:3001/api'
const tasks = ref<any[]>([])
const teams = ref<any[]>([])
const form = ref({ taskId: '', teamId: '', multiplier: 1, file: null as File | null })
const status = ref('')

onMounted(async () => {
  const [t, tm] = await Promise.all([axios.get(`${API_URL}/tasks`), axios.get(`${API_URL}/teams`)])
  tasks.value = t.data; teams.value = tm.data
})

const upload = async () => {
  if (!form.value.file || !form.value.taskId || !form.value.teamId) return alert('Заполните все поля')
  status.value = 'Загрузка...'
  const fd = new FormData()
  fd.append('image', form.value.file)
  fd.append('taskId', form.value.taskId)
  fd.append('teamId', form.value.teamId)
  fd.append('multiplier', form.value.multiplier.toString())
  fd.append('manual', 'true') // Флаг для бэкенда
  
  try {
    await axios.post(`${API_URL}/upload`, fd)
    status.value = '✅ Успешно загружено в ручном режиме'
    form.value = { taskId: '', teamId: '', multiplier: 1, file: null }
  } catch (e) { status.value = '❌ Ошибка загрузки' }
}
</script>

<template>
  <div class="p-8 max-w-2xl mx-auto">
    <h1 class="text-2xl font-bold mb-2">📝 Ручная загрузка бланка</h1>
    <p class="text-gray-600 mb-6">Используйте этот режим, если интернет нестабилен или QR-код поврежден.</p>
    
    <form @submit.prevent="upload" class="space-y-4 bg-white p-6 rounded-lg shadow">
      <div>
        <label class="block font-semibold mb-1">Задача:</label>
        <select v-model="form.taskId" class="w-full p-3 border rounded" required>
          <option value="">Выберите задачу</option>
          <option v-for="t in tasks" :key="t.id" :value="t.id">{{ t.code }} — {{ t.title }}</option>
        </select>
      </div>
      <div>
        <label class="block font-semibold mb-1">Команда:</label>
        <select v-model="form.teamId" class="w-full p-3 border rounded" required>
          <option value="">Выберите команду</option>
          <option v-for="t in teams" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
      </div>
      <div>
        <label class="block font-semibold mb-1">Множитель:</label>
        <select v-model.number="form.multiplier" class="w-full p-3 border rounded">
          <option :value="1">×1 (Стандарт)</option>
          <option :value="2">×2 (Усложненный)</option>
          <option :value="3">×3 (Олимпиадный)</option>
        </select>
      </div>
      <div>
        <label class="block font-semibold mb-1">Фото бланка:</label>
        <input type="file" @change="e => form.file = e.target.files[0]" class="w-full p-3 border rounded" required />
      </div>
      
      <button class="w-full bg-orange-600 text-white py-3 rounded font-bold hover:bg-orange-700 transition">📤 Загрузить вручную</button>
      <p v-if="status" class="text-center font-semibold mt-2" :class="status.includes('✅') ? 'text-green-600' : 'text-red-600'">{{ status }}</p>
    </form>
  </div>
</template>