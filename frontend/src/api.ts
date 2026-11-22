// Общая настройка axios для всех вью: базовый адрес Gateway и автоматическая
// подстановка JWT-токена из localStorage. Раньше каждый компонент сам лепил
// Authorization-заголовок или вовсе работал без него (например, очередь жюри).
import axios from 'axios'

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api'
export const BASE_URL = import.meta.env.VITE_BASE_URL ?? 'http://localhost:3001'

export const api = axios.create({ baseURL: API_URL })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
