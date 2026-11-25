
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import http from 'http';
import prisma from './config/database';
import { initSocket } from './config/socket';

import tasksRoutes from './routes/tasks.routes';
import teamsRoutes from './routes/teams.routes';
import tournamentsRoutes from './routes/tournaments.routes';
import submissionsRoutes from './routes/submissions.routes';
import appealsRoutes from './routes/appeals.routes';
import scoreboardRoutes from './routes/scoreboard.routes';
import blanksRoutes from './routes/blanks.routes';

dotenv.config();

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      service: 'core',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Core database health check failed:', error);
    res.status(503).json({ status: 'error', service: 'core', db: 'down' });
  }
});

app.use('/api/tasks', tasksRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/tournaments', tournamentsRoutes);
app.use('/api/submissions', submissionsRoutes);
app.use('/api/appeals', appealsRoutes);
app.use('/api/scoreboard', scoreboardRoutes);
app.use('/api/blanks', blanksRoutes);

const server = http.createServer(app);
initSocket(server);

const PORT = Number(process.env.PORT ?? 3003);

server.listen(PORT, () => {
  console.log(`Core Service запущен: http://localhost:${PORT}`);
});

const shutdown = () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
