import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { z } from 'zod';
import multer from 'multer';
import sharp from 'sharp';
import jsQR from 'jsqr';
import path from 'path';
import fs from 'fs';
import { 
  hashPassword, 
  comparePassword, 
  generateToken, 
  authMiddleware, 
  requireRole,
  AuthRequest 
} from './auth/auth';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { 
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST']
  } 
});
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Папка для загрузки файлов
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|heic/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Только изображения (jpeg, jpg, png, heic)'));
  }
});

// ==================== СХЕМЫ ВАЛИДАЦИИ ====================

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['ADMIN', 'JURY', 'REPRESENTATIVE', 'COMPOSER', 'STUDENT']).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  maxPoints: z.number().int().positive(),
  tournamentId: z.string().uuid().optional(),
});

const createTournamentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const createTeamSchema = z.object({
  name: z.string().min(1),
  tournamentId: z.string().uuid(),
});

const scoreSubmissionSchema = z.object({
  points: z.number().int().min(0),
});

// ==================== ЗДОРОВЬЕ ====================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== АВТОРИЗАЦИЯ ====================

app.post('/api/auth/register', async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }
    const hashedPassword = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        role: data.role || 'STUDENT',
      },
      select: { id: true, email: true, name: true, role: true },
    });
    const token = generateToken({ id: user.id, email: user.email, role: user.role });
    res.status(201).json({ user, token });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Ошибка валидации', details: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) return res.status(401).json({ error: 'Неверный email или пароль' });
    const isValid = await comparePassword(data.password, user.password);
    if (!isValid) return res.status(401).json({ error: 'Неверный email или пароль' });
    const token = generateToken({ id: user.id, email: user.email, role: user.role });
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Ошибка валидации', details: error.errors });
    }
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, role: true, teamId: true },
  });
  res.json(user);
});

// ==================== ЗАДАЧИ ====================

app.get('/api/tasks', async (req, res) => {
  const { tournamentId } = req.query;
  
  const where = tournamentId ? { tournamentId: tournamentId as string } : {};
  
  const tasks = await prisma.task.findMany({ 
    where,
    include: { tournament: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' } 
  });
  res.json(tasks);
});

app.post('/api/tasks', authMiddleware, requireRole('ADMIN', 'COMPOSER'), async (req: AuthRequest, res) => {
  try {
    const data = createTaskSchema.parse(req.body);
    const task = await prisma.task.create({ 
      data: {
        title: data.title,
        description: data.description,
        maxPoints: data.maxPoints,
        tournamentId: data.tournamentId || null,
      }
    });
    res.status(201).json(task);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Ошибка валидации', details: error.errors });
    }
    res.status(500).json({ error: 'Ошибка создания задачи' });
  }
});

app.delete('/api/tasks/:id', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  await prisma.task.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ==================== ТУРНИРЫ ====================

app.get('/api/tournaments', async (req, res) => {
  const tournaments = await prisma.tournament.findMany({
    include: { teams: true, _count: { select: { teams: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(tournaments);
});

app.get('/api/tournaments/:id', async (req, res) => {
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id },
    include: { 
      teams: { include: { members: true } },
      tasks: true
    },
  });
  if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
  res.json(tournament);
});

app.post('/api/tournaments', authMiddleware, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const data = createTournamentSchema.parse(req.body);
    const tournament = await prisma.tournament.create({
      data: {
        name: data.name,
        description: data.description,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
    });
    res.status(201).json(tournament);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Ошибка валидации', details: error.errors });
    }
    res.status(500).json({ error: 'Ошибка создания турнира' });
  }
});

app.post('/api/tournaments/:id/start', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  const tournament = await prisma.tournament.update({
    where: { id: req.params.id },
    data: { status: 'ACTIVE' },
  });
  res.json(tournament);
});

app.post('/api/tournaments/:id/finish', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  const tournament = await prisma.tournament.update({
    where: { id: req.params.id },
    data: { status: 'FINISHED' },
  });
  res.json(tournament);
});

// ==================== КОМАНДЫ ====================

app.get('/api/tournaments/:tournamentId/teams', async (req, res) => {
  const teams = await prisma.team.findMany({
    where: { tournamentId: req.params.tournamentId },
    include: { members: true },
  });
  res.json(teams);
});

app.post('/api/teams', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const data = createTeamSchema.parse(req.body);
    const team = await prisma.team.create({
      data: { name: data.name, tournamentId: data.tournamentId },
      include: { members: true },
    });
    res.status(201).json(team);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Ошибка валидации', details: error.errors });
    }
    res.status(500).json({ error: 'Ошибка создания команды' });
  }
});

app.post('/api/teams/:teamId/members/:userId', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: { teamId: req.params.teamId },
  });
  res.json(user);
});

// ==================== ЗАГРУЗКА И ОБРАБОТКА ФОТО ====================

app.post('/api/upload', authMiddleware, requireRole('REPRESENTATIVE', 'ADMIN'), upload.single('image'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    // Создаём запись о загруженном изображении
    const blankImage = await prisma.blankImage.create({
      data: {
        filePath: req.file.filename,
        status: 'PROCESSING',
        uploadedBy: req.user!.id,
      },
    });

    // Асинхронная обработка (теперь без taskId, teamId, multiplier)
    processImage(blankImage.id, req.file.path);

    res.json({ 
      success: true, 
      imageId: blankImage.id, 
      message: 'Загружено, обрабатывается' 
    });
  } catch (error) {
    console.error('Ошибка загрузки:', error);
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

// Функция обработки изображения
async function processImage(
  imageId: string, 
  filePath: string
  // Больше не передаем taskId, teamId, multiplier — они в QR!
) {
  try {
    // 1. Генерация превью
    const thumbnailPath = filePath + '_thumb.jpg';
    await sharp(filePath)
      .resize(300, 300, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);

    // 2. Распознавание QR-кода
    let status: 'READY' | 'NEEDS_RESCAN' = 'NEEDS_RESCAN';
    let qrData: string | null = null;
    let submission = null;
    let recognizedData = null;

    try {
      // Получаем сырые пиксели в формате RGBA
      const { data, info } = await sharp(filePath)
        .toColourspace('srgb')
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const uint8Data = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
      const code = jsQR(uint8Data, info.width, info.height);

      if (code && code.data) {
        // Пытаемся распарсить JSON
        try {
          const qrPayload = JSON.parse(code.data);
          const { taskId, teamId, multiplier, basePoints, taskTitle, teamName } = qrPayload;
          
          recognizedData = {
            taskId,
            teamId,
            teamName,
            multiplier,
            basePoints,
            taskTitle: taskTitle || `Задача ${taskId}`
          };

          // Проверяем, что все обязательные поля есть
          if (taskId && teamId && multiplier) {
            status = 'READY';
            qrData = code.data;

            // Создаём заявку с данными из QR
            submission = await prisma.submission.create({
              data: {
                taskId,
                teamId,
                multiplier,
                status: 'PENDING_REVIEW',
                imageId,
              },
              include: {
                task: true,
                team: true,
              },
            });

            console.log(`✅ QR распознан: задача ${taskTitle}, команда ${teamId}, ×${multiplier}`);
            
            // Уведомляем жюри
            io.emit('new_submission', submission);
          } else {
            console.warn('⚠️ В QR не хватает обязательных полей:', qrPayload);
          }
        } catch (parseError) {
          console.warn('️ Не удалось распарсить JSON из QR:', code.data);
        }
      }
    } catch (qrError) {
      console.log('QR не распознан:', qrError instanceof Error ? qrError.message : qrError);
    }

    // 3. Обновление статуса изображения
    await prisma.blankImage.update({
      where: { id: imageId },
      data: { 
        status, 
        thumbnailPath: path.basename(thumbnailPath),
        qrData 
      },
    });

    // 4. Уведомляем клиента о результате обработки
    io.emit('image_processed', { 
      imageId, 
      status: status.toLowerCase(),
      submissionId: submission?.id,
      qrData: recognizedData ? JSON.stringify(recognizedData) : null
    });

  } catch (err) {
    console.error('Критическая ошибка обработки изображения:', err);
    await prisma.blankImage.update({
      where: { id: imageId },
      data: { status: 'FAILED' },
    });
    io.emit('image_processed', { imageId, status: 'failed' });
  }
}

// Получить табло (для учеников)
app.get('/api/scoreboard', async (req, res) => {
  const submissions = await prisma.submission.findMany({
    where: { 
      status: {
        in: ['SCORED', 'APPEALED', 'RESOLVED'] // Показываем все оцененные и оспоренные работы
      }
    },
    include: {
      task: true,
      team: true,
      appeal: true, // 👈 Обязательно добавляем, чтобы фронтенд знал статус апелляции
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(submissions);
});

// ==================== SOCKET.IO ====================

io.on('connection', (socket) => {
  console.log('✅ Клиент подключился:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('❌ Клиент отключился:', socket.id);
  });
});

// Подать апелляцию (Ученик)
app.post('/api/submissions/:id/appeal', authMiddleware, requireRole('STUDENT', 'ADMIN'), async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Укажите причину апелляции' });

    const submission = await prisma.submission.update({
      where: { id: req.params.id },
      data: { status: 'APPEALED' },
    });

    const appeal = await prisma.appeal.create({
      data: {
        submissionId: submission.id,
        reason,
      },
      include: { submission: { include: { task: true, team: true, image: true } } },
    });

    io.emit('new_appeal', appeal);
    res.status(201).json(appeal);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка подачи апелляции' });
  }
});

// Получить очередь апелляций (Жюри)
app.get('/api/appeals/pending', authMiddleware, requireRole('JURY', 'ADMIN'), async (req, res) => {
  const appeals = await prisma.appeal.findMany({
    where: { status: 'PENDING' },
    include: {
      submission: {
        include: { task: true, team: true, image: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(appeals);
});

// Рассмотреть апелляцию (Жюри)
app.post('/api/appeals/:id/resolve', authMiddleware, requireRole('JURY', 'ADMIN'), async (req, res) => {
  try {
    const { action, newPoints } = req.body; // action: 'ACCEPTED' | 'REJECTED'
    
    const appeal = await prisma.appeal.update({
      where: { id: req.params.id },
      data: { 
        status: action,
        resolvedAt: new Date(),
      },
      include: {
        submission: true,
      },
    });

    // Если апелляция принята, обновляем баллы и статус работы
    if (action === 'ACCEPTED') {
      await prisma.submission.update({
        where: { id: appeal.submissionId },
        data: { 
          points: newPoints, 
          status: 'RESOLVED' 
        },
      });
    } else {
      await prisma.submission.update({
        where: { id: appeal.submissionId },
        data: { status: 'RESOLVED' },
      });
    }

    // Уведомляем всех об изменении табло
    const updatedSubmission = await prisma.submission.findUnique({
      where: { id: appeal.submissionId },
      include: { task: true, team: true, appeal: true },
    });
    io.emit('scoreboard_updated', updatedSubmission);

    res.json(appeal);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка рассмотрения апелляции' });
  }
});

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import path from 'path';

app.get('/api/blanks/generate-team', async (req, res) => {
  try {
    const { teamId } = req.query;
    if (!teamId) return res.status(400).json({ error: 'Не указан teamId' });

    // 1. Получаем данные команды
    const team = await prisma.team.findUnique({ where: { id: teamId as string } });
    if (!team) return res.status(404).json({ error: 'Команда не найдена' });

    // 2. Получаем все задачи
    const tasks = await prisma.task.findMany({ 
      where: { 
        OR: [
          { tournamentId: team.tournamentId },  // Задачи этого турнира
          { tournamentId: null }                // + общие задачи (без турнира)
        ]
      },
      orderBy: { id: 'asc' } 
    });

    res.setHeader('Content-Type', 'application/pdf');
    const safeName = transliterate(team.name);
    res.setHeader('Content-Disposition', `attachment; filename=blanks_${safeName}.pdf`);
    // 3. Создаем PDF документ (формат A6 удобен для нарезки)
    // ВАЖНО: Убедитесь, что шрифт DejaVuSans.ttf лежит в backend/fonts/
    const fontPath = path.join(__dirname, '../fonts/DejaVuSans.ttf');
    const doc = new PDFDocument({ 
      size: 'A6', 
      margin: 15,
      font: fontPath 
    });
    
    doc.pipe(res);
    doc.font(fontPath); // Применяем шрифт с кириллицей ко всему документу

    let isFirstPage = true;

    // 4. Генерируем страницы: для каждой задачи создаем 3 варианта (×1, ×2, ×3)
    for (const task of tasks) {
      for (const multiplier of [1, 2, 3]) {
        if (!isFirstPage) {
          doc.addPage();
        }
        isFirstPage = false;

        // Заголовок с именем команды
        doc.fontSize(10).fillColor('gray').text(`Команда: ${team.name}`, { align: 'center' });
        doc.moveDown(0.2);

        // Название задачи
        doc.fontSize(14).fillColor('black').font(fontPath).text(`Задача: ${task.title}`, { align: 'center' });
        doc.moveDown(0.3);
        
        // Условие задачи
        doc.fontSize(11).text(task.description, { 
          align: 'center',
          width: doc.page.width - 30 
        });
        doc.moveDown(0.5);
        
        // Множитель (крупно и цветным)
        const color = multiplier === 1 ? 'black' : (multiplier === 2 ? 'blue' : 'red');
        doc.fontSize(18).fillColor(color).font(fontPath).text(`Множитель: ×${multiplier}`, { align: 'center' });
        doc.moveDown(0.5);
        doc.fillColor('black'); // Возвращаем черный цвет

        // 5. Генерируем QR-код с ПОЛНЫМИ данными
        const qrPayload = {
          taskId: task.id,
          teamId: team.id,
          teamName: team.name,
          multiplier: multiplier,
          basePoints: task.maxPoints,
          taskTitle: task.title
        };

        const qrDataUrl = await QRCode.toDataURL(JSON.stringify(qrPayload), {
          width: 200,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' }
        });
        
        doc.image(qrDataUrl, {
          fit: [160, 160],
          align: 'center',
        });
        
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor('gray').text('Отсканируйте представителем', { align: 'center' });
      }
    }

    doc.end();
  } catch (error) {
    console.error('Ошибка генерации PDF:', error);
    res.status(500).json({ error: 'Ошибка генерации PDF' });
  }
});

// Получить очередь на проверку (для жюри)
app.get('/api/submissions/pending', authMiddleware, requireRole('JURY', 'ADMIN'), async (req, res) => {
  const submissions = await prisma.submission.findMany({
    where: { status: 'PENDING_REVIEW' },
    include: {
      task: true,
      team: true,
      image: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(submissions);
});

// Выставить баллы (для жюри)
app.post('/api/submissions/:id/score', authMiddleware, requireRole('JURY', 'ADMIN'), async (req, res) => {
  try {
    const { points } = req.body;
    const submission = await prisma.submission.update({
      where: { id: req.params.id },
      data: { 
        points, 
        status: 'SCORED' 
      },
      include: {
        task: true,
        team: true,
      },
    });
    
    // Уведомляем всех об обновлении табло
    io.emit('scoreboard_updated', submission);
    
    res.json(submission);
  } catch (error) {
    console.error('Ошибка выставления баллов:', error);
    res.status(500).json({ error: 'Ошибка выставления баллов' });
  }
});

// Получить табло (для учеников)
app.get('/api/scoreboard', async (req, res) => {
  const submissions = await prisma.submission.findMany({
    where: { 
      status: {
        in: ['SCORED', 'APPEALED', 'RESOLVED']
      }
    },
    include: {
      task: true,
      team: true,
      appeal: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(submissions);
});

function transliterate(text: string): string {
  const map: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
    'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
    'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
    'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
    'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
  };
  return text.split('').map(c => map[c] || c).join('').replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ==================== ЗАПУСК ====================
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

