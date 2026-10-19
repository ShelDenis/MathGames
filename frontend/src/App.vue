<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from './stores/auth'
import LoginView from './views/LoginView.vue'
import TournamentsView from './views/TournamentsView.vue'
import TasksView from './views/TasksView.vue'
import RepresentativeView from './views/RepresentativeView.vue'
import JuryView from './views/JuryView.vue'
import ScoreboardView from './views/ScoreboardView.vue'
import AppealsView from './views/AppealsView.vue'

const auth = useAuthStore()
const currentTab = ref('dashboard')

onMounted(() => {
  auth.loadMe()
})

const availableTabs = computed(() => {
  const tabs = []
  if (auth.user?.role === 'ADMIN') {
    tabs.push({ id: 'tournaments', label: '🏆 Турниры' })
    tabs.push({ id: 'tasks', label: '📚 Задачи' })
  }
  if (auth.user?.role === 'REPRESENTATIVE' || auth.user?.role === 'ADMIN') {
    tabs.push({ id: 'upload', label: '📸 Загрузить бланк' })
  }
  if (auth.user?.role === 'JURY' || auth.user?.role === 'ADMIN') {
    tabs.push({ id: 'jury', label: '👨‍⚖️ Проверка' })
    tabs.push({ id: 'appeals', label: '⚖️ Апелляции' })
  }
  tabs.push({ id: 'scoreboard', label: '🏅 Табло' })
  return tabs
})
</script>

<template>
  <div v-if="!auth.isAuthenticated">
    <LoginView />
  </div>
  <div v-else>
    <!-- Шапка -->
    <header class="bg-white shadow-sm border-b">
      <div class="max-w-6xl mx-auto px-8 py-4 flex justify-between items-center">
        <h1 class="text-xl font-bold">🎮 Математические игры</h1>
        <div class="flex items-center gap-4">
          <span class="text-sm text-gray-600">
            👤 {{ auth.user?.name }} 
            <span class="px-2 py-1 bg-gray-200 rounded text-xs ml-1">{{ auth.user?.role }}</span>
          </span>
          <button @click="auth.logout()" class="text-sm text-red-600 hover:underline">Выйти</button>
        </div>
      </div>
      <!-- Вкладки -->
      <nav class="max-w-6xl mx-auto px-8 flex gap-4 overflow-x-auto">
        <button
          v-for="tab in availableTabs"
          :key="tab.id"
          @click="currentTab = tab.id"
          :class="['py-2 px-4 border-b-2 font-medium whitespace-nowrap', 
                   currentTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600']"
        >
          {{ tab.label }}
        </button>
      </nav>
    </header>

    <!-- Контент -->
    <main>
      <TournamentsView v-if="currentTab === 'tournaments'" />
      <TasksView v-else-if="currentTab === 'tasks'" />
      <RepresentativeView v-else-if="currentTab === 'upload'" />
      <JuryView v-else-if="currentTab === 'jury'" />
      <ScoreboardView v-else-if="currentTab === 'scoreboard'" />
      <AppealsView v-else-if="currentTab === 'appeals'" />
    </main>
  </div>
</template>