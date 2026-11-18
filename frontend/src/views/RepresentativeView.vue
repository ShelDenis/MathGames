<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import { io, Socket } from 'socket.io-client'
import jsQR from 'jsqr'  // ← НОВЫЙ ИМПОРТ

const API_URL = 'http://localhost:3001/api'
let socket: Socket

interface RecognizedData {
  taskTitle?: string
  teamName?: string
  multiplier: number
  basePoints: number
}

const selectedFile = ref<File | null>(null)
const uploadStatus = ref<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle')
const statusMessage = ref('')
const recognizedQr = ref<RecognizedData | null>(null)
const clientQrStatus = ref<'none' | 'found' | 'not_found'>('none')  // ← НОВОЕ

const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    selectedFile.value = target.files[0]
    
    // 🚀 МГНОВЕННАЯ КЛИЕНТСКАЯ ПРОВЕРКА QR
    await checkQrOnClient(target.files[0])
  }
}

const checkQrOnClient = async (file: File) => {
  clientQrStatus.value = 'none'
  
  try {
    // Читаем файл как Image
    const img = new Image()
    const url = URL.createObjectURL(file)
    
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Не удалось загрузить изображение'))
      img.src = url
    })
    
    // Рисуем на canvas для получения пикселей
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Ограничиваем размер для производительности
    const maxSize = 1000
    const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
    canvas.width = img.width * scale
    canvas.height = img.height * scale
    
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    
    // Пытаемся найти QR
    const code = jsQR(imageData.data, imageData.width, imageData.height)
    
    if (code && code.data) {
      clientQrStatus.value = 'found'
      console.log('✅ Клиент нашел QR:', code.data)
    } else {
      clientQrStatus.value = 'not_found'
      console.log('⚠️ Клиент не нашел QR')
    }
    
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Ошибка клиентской проверки QR:', error)
  }
}

const uploadImage = async () => {
  if (!selectedFile.value) {
    alert('Выберите файл')
    return
  }

  // Предупреждение, если клиент не нашел QR
  if (clientQrStatus.value === 'not_found') {
    if (!confirm('⚠️ QR-код не найден на изображении. Всё равно загрузить?')) {
      return
    }
  }

  uploadStatus.value = 'uploading'
  statusMessage.value = 'Загрузка файла...'
  recognizedQr.value = null

  const formData = new FormData()
  formData.append('image', selectedFile.value)

  try {
    await axios.post(`${API_URL}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    uploadStatus.value = 'processing'
    statusMessage.value = 'Обработка на сервере...'
  } catch (error) {
    uploadStatus.value = 'error'
    statusMessage.value = 'Ошибка загрузки'
  }
}

onMounted(() => {
  socket = io('http://localhost:3001')
  socket.on('image_processed', (data) => {
    if (data.status === 'ready') {
      uploadStatus.value = 'success'
      statusMessage.value = '✅ Готово! Работа отправлена жюри'
      selectedFile.value = null
      
      if (data.qrData) {
        try {
          const qrPayload = JSON.parse(data.qrData)
          recognizedQr.value = {
            multiplier: qrPayload.multiplier,
            basePoints: qrPayload.basePoints,
            taskTitle: qrPayload.taskTitle || `Задача ${qrPayload.taskId}`,
            teamName: qrPayload.teamName || `Команда ${qrPayload.teamId}`
          }
        } catch {
          recognizedQr.value = null
        }
      }
    } else if (data.status === 'needs_rescan') {
      uploadStatus.value = 'error'
      statusMessage.value = '⚠️ QR-код не распознан сервером. Переснимите бланк.'
      recognizedQr.value = null
    } else {
      uploadStatus.value = 'error'
      statusMessage.value = '❌ Ошибка обработки'
      recognizedQr.value = null
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

    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <p class="text-blue-800 text-sm">
        <strong>Инструкция:</strong> сфотографируйте бланк с QR-кодом. 
        Система автоматически распознает данные из QR.
      </p>
    </div>

    <form @submit.prevent="uploadImage" class="space-y-4">
      <div>
        <label class="block font-semibold mb-2">Фото бланка:</label>
        <input 
          type="file" 
          accept="image/*" 
          capture="environment"
          @change="handleFileSelect"
          class="w-full p-3 border rounded bg-white"
          required
        />
        <p class="text-xs text-gray-500 mt-1">
          💡 Можно сделать фото прямо с камеры телефона
        </p>
      </div>

      <!-- 🚀 НОВЫЙ ИНДИКАТОР КЛИЕНТСКОЙ ПРОВЕРКИ -->
      <div v-if="clientQrStatus !== 'none'" class="p-3 rounded-lg border"
        :class="{
          'bg-green-50 border-green-300 text-green-800': clientQrStatus === 'found',
          'bg-yellow-50 border-yellow-300 text-yellow-800': clientQrStatus === 'not_found'
        }">
        <div class="flex items-center gap-2">
          <span class="text-xl">
            {{ clientQrStatus === 'found' ? '✅' : '⚠️' }}
          </span>
          <span class="text-sm font-medium">
            {{ clientQrStatus === 'found' 
              ? 'QR-код найден на изображении' 
              : 'QR-код не обнаружен. Убедитесь, что бланк сфотографирован целиком.' }}
          </span>
        </div>
      </div>

      <button 
        type="submit"
        :disabled="uploadStatus === 'uploading' || uploadStatus === 'processing'"
        class="w-full bg-blue-600 text-white py-3 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
      >
        📤 Загрузить бланк
      </button>
    </form>

    <!-- Статус обработки -->
    <div 
      v-if="statusMessage" 
      class="mt-6 p-4 rounded-lg border"
      :class="{
        'bg-blue-100 border-blue-300 text-blue-800': uploadStatus === 'uploading' || uploadStatus === 'processing',
        'bg-green-100 border-green-300 text-green-800': uploadStatus === 'success',
        'bg-red-100 border-red-300 text-red-800': uploadStatus === 'error'
      }"
    >
      <div class="flex items-center gap-2">
        <span class="text-2xl">
          {{ uploadStatus === 'uploading' ? '⏳' : 
             uploadStatus === 'processing' ? '⚙️' : 
             uploadStatus === 'success' ? '✅' : '❌' }}
        </span>
        <span>{{ statusMessage }}</span>
      </div>
    </div>

    <!-- Распознанные данные из QR (серверная проверка) -->
    <div v-if="recognizedQr && uploadStatus === 'success'" class="mt-6 p-6 bg-green-50 border-2 border-green-300 rounded-lg">
      <h4 class="font-bold text-green-800 mb-3 text-lg">📋 Распознанные данные (сервер):</h4>
      <div class="space-y-2 text-green-900">
        <p><strong>Задача:</strong> {{ recognizedQr.taskTitle }}</p>
        <p><strong>Команда:</strong> {{ recognizedQr.teamName }}</p>
        <p><strong>Множитель:</strong> ×{{ recognizedQr.multiplier }}</p>
        <p><strong>Базовые баллы:</strong> {{ recognizedQr.basePoints }}</p>
        <div class="mt-3 pt-3 border-t border-green-300">
          <p class="font-bold text-xl">
            Макс. за задачу: {{ recognizedQr.multiplier * recognizedQr.basePoints }} баллов
          </p>
        </div>
      </div>
    </div>
  </div>
</template>