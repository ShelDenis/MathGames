import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

const API_URL = 'http://localhost:3001/api'

interface User {
  id: string
  email: string
  name: string
  role: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem('token'))

  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'ADMIN')

  // Настраиваем axios, чтобы он автоматически добавлял токен
  if (token.value) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token.value}`
  }

  const login = async (email: string, password: string) => {
    const { data } = await axios.post(`${API_URL}/auth/login`, { email, password })
    user.value = data.user
    token.value = data.token
    localStorage.setItem('token', data.token)
    axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`
  }

  const register = async (email: string, password: string, name: string, role: string) => {
    const { data } = await axios.post(`${API_URL}/auth/register`, { email, password, name, role })
    user.value = data.user
    token.value = data.token
    localStorage.setItem('token', data.token)
    axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`
  }

  const loadMe = async () => {
    if (!token.value) return
    try {
      const { data } = await axios.get(`${API_URL}/auth/me`)
      user.value = data
    } catch {
      logout()
    }
  }

  const logout = () => {
    user.value = null
    token.value = null
    localStorage.removeItem('token')
    delete axios.defaults.headers.common['Authorization']
  }

  return { user, token, isAuthenticated, isAdmin, login, register, loadMe, logout }
})