import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

import { initSocket } from './config/socket';

// Импорт роутов
import authRoutes from './routes/auth.routes';
import tasksRoutes from './routes/tasks.routes';
import teamsRoutes from './routes/teams.routes';
import tournamentsRoutes from './routes/tournaments.routes';
import submissionsRoutes from './routes/submissions.routes';
import appealsRoutes from './routes/appeals.routes';
import scoreboardRoutes from './routes/scoreboard.routes';
import blanksRoutes from './routes/blanks.routes';
import uploadRoutes from './routes/upload.routes';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Инициализация Socket.IO
initSocket(server);

app.use(cors());
app.use(express.json());

// Статика для загруженных файлов
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// Подключение роутов (Маршрутизация)
app.use('/api/auth', authRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/tournaments', tournamentsRoutes);
app.use('/api/submissions', submissionsRoutes);
app.use('/api/appeals', appealsRoutes);
app.use('/api/scoreboard', scoreboardRoutes);
app.use('/api/blanks', blanksRoutes);
app.use('/api/upload', uploadRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});