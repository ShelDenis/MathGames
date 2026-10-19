<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const isRegister = ref(false)
const email = ref('')
const password = ref('')
const name = ref('')
const role = ref('STUDENT')
const error = ref('')

const submit = async () => {
  error.value = ''
  try {
    if (isRegister.value) {
      await auth.register(email.value, password.value, name.value, role.value)
    } else {
      await auth.login(email.value, password.value)
    }
  } catch (e: any) {
    error.value = e.response?.data?.error || 'Ошибка'
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100">
    <div class="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
      <h1 class="text-2xl font-bold mb-6 text-center">
        {{ isRegister ? 'Регистрация' : 'Вход' }}
      </h1>

      <form @submit.prevent="submit" class="space-y-4">
        <input
          v-if="isRegister"
          v-model="name"
          placeholder="Имя"
          class="w-full p-3 border rounded"
          required
        />
        <input
          v-model="email"
          type="email"
          placeholder="Email"
          class="w-full p-3 border rounded"
          required
        />
        <input
          v-model="password"
          type="password"
          placeholder="Пароль (мин. 6 символов)"
          class="w-full p-3 border rounded"
          required
        />
        <select v-if="isRegister" v-model="role" class="w-full p-3 border rounded">
          <option value="STUDENT">Ученик</option>
          <option value="JURY">Жюри</option>
          <option value="REPRESENTATIVE">Представитель</option>
          <option value="COMPOSER">Составитель</option>
          <option value="ADMIN">Админ</option>
        </select>

        <div v-if="error" class="text-red-600 text-sm">{{ error }}</div>

        <button
          type="submit"
          class="w-full bg-blue-600 text-white py-3 rounded hover:bg-blue-700"
        >
          {{ isRegister ? 'Зарегистрироваться' : 'Войти' }}
        </button>
      </form>

      <p class="mt-4 text-center text-sm text-gray-600">
        <button @click="isRegister = !isRegister" class="text-blue-600 hover:underline">
          {{ isRegister ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться' }}
        </button>
      </p>
    </div>
  </div>
</template>