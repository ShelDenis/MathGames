<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'

interface Task {
  id: string
  title: string
  description: string
  maxPoints: number
}

const tasks = ref<Task[]>([])
const newTask = ref({ 
  title: '', 
  description: '', 
  maxPoints: 10 
})

const API_URL = 'http://localhost:3001/api'

const loadTasks = async () => {
  try {
    const { data } = await axios.get(`${API_URL}/tasks`)
    tasks.value = data
  } catch (error) {
    console.error('Ошибка загрузки задач:', error)
  }
}

const createTask = async () => {
  try {
    await axios.post(`${API_URL}/tasks`, newTask.value)
    // Очищаем форму
    newTask.value = { title: '', description: '', maxPoints: 10 }
    // Перезагружаем список
    await loadTasks()
  } catch (error) {
    console.error('Ошибка создания задачи:', error)
    alert('Не удалось создать задачу. Проверьте консоль.')
  }
}

// Загружаем задачи при открытии страницы
onMounted(loadTasks)
</script>

<template>
  <div class="p-8 max-w-4xl mx-auto font-sans">
    <h1 class="text-3xl font-bold mb-6 text-gray-800">📚 Банк задач</h1>

    <!-- Форма создания -->
    <form @submit.prevent="createTask" class="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-lg shadow-sm">
      <h2 class="text-xl font-semibold mb-4 text-blue-800">Создать новую задачу</h2>
      
      <input
        v-model="newTask.title"
        placeholder="Название задачи (например, 'Теорема Пифагора')"
        class="w-full p-3 mb-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        required
      />
      <textarea
        v-model="newTask.description"
        placeholder="Описание или условие задачи"
        class="w-full p-3 mb-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        rows="3"
        required
      />
      <input
        v-model.number="newTask.maxPoints"
        type="number"
        placeholder="Максимальные баллы"
        class="w-full p-3 mb-4 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        required
      />
      
      <button
        type="submit"
        class="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded hover:bg-blue-700 transition duration-200"
      >
        ➕ Добавить задачу
      </button>
    </form>

    <!-- Список задач -->
    <div class="space-y-4">
  <h2 class="text-2xl font-semibold text-gray-700 mb-4">Список задач ({{ tasks.length }})</h2>
  
  <div
    v-for="task in tasks"
    :key="task.id"
    class="p-5 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition"
  >
    <!-- 👇 ВОТ ЭТОТ БЛОК ВЫ СЛУЧАЙНО УДАЛИЛИ -->
    <div class="flex justify-between items-start">
      <div class="flex-1">
        <h3 class="text-lg font-bold text-gray-800">{{ task.title }}</h3>
        <p class="text-gray-600 mt-2 whitespace-pre-wrap">{{ task.description }}</p>
        <span class="inline-block mt-3 bg-green-100 text-green-800 text-sm font-semibold px-3 py-1 rounded">
          Макс. баллов: {{ task.maxPoints }}
        </span>
      </div>
    </div>
    <!-- 👆 КОНЕЦ УДАЛЁННОГО БЛОКА -->

    <!-- Кнопки генерации бланков -->
    <div class="mt-4 flex gap-2 flex-wrap">
      <a 
        :href="`${API_URL}/blanks/generate?taskId=${task.id}&multiplier=1&count=5`"
        target="_blank"
        class="text-sm bg-gray-200 text-gray-800 px-3 py-1 rounded hover:bg-gray-300 flex items-center gap-1"
      >
        🖨️ Бланки ×1 (5 шт)
      </a>
      <a 
        :href="`${API_URL}/blanks/generate?taskId=${task.id}&multiplier=2&count=5`"
        target="_blank"
        class="text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded hover:bg-blue-200 flex items-center gap-1"
      >
        🖨️ Бланки ×2 (5 шт)
      </a>
      <a 
        :href="`${API_URL}/blanks/generate?taskId=${task.id}&multiplier=3&count=5`"
        target="_blank"
        class="text-sm bg-purple-100 text-purple-800 px-3 py-1 rounded hover:bg-purple-200 flex items-center gap-1"
      >
        🖨️ Бланки ×3 (5 шт)
      </a>
    </div>
  </div>

      <div v-if="tasks.length === 0" class="text-center text-gray-500 py-8">
        Пока нет ни одной задачи. Создайте первую выше! ☝️
      </div>
    </div>
  </div>
</template>