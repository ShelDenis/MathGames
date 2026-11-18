import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import prisma from '../config/database';
import { authMiddleware, requireRole, AuthRequest } from '../auth/auth';
import { processImage } from '../services/image.service';

const router = Router();

// Настройка multer
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

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

// POST /api/upload
router.post('/', authMiddleware, requireRole('REPRESENTATIVE', 'ADMIN'), upload.single('image'), async (req: AuthRequest, res: Response) => {
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

    // Асинхронная обработка изображения
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

export default router;