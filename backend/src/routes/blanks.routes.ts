import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import path from 'path';

const router = Router();

// --- Функция транслитерации ---
function transliterate(text: string): string {
  const map: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    ' ': '_', '-': '_'
  };
  return text.toLowerCase().split('').map(c => map[c] || c).join('').replace(/[^a-z0-9_-]/g, '_');
}

// GET /api/blanks/generate-team
router.get('/generate-team', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.query;
    if (!teamId) return res.status(400).json({ error: 'Не указан teamId' });

    // 1. Получаем данные команды
    const team = await prisma.team.findUnique({ 
      where: { id: teamId as string },
      include: { tournament: true }
    });
    if (!team) return res.status(404).json({ error: 'Команда не найдена' });

    // ... (код получения задач tasks без изменений) ...
    const tasks = await prisma.task.findMany({ 
      where: { 
        OR: [
          { tournamentId: team.tournamentId },
          { tournamentId: null }
        ]
      },
      orderBy: { id: 'asc' } 
    });

    if (tasks.length === 0) {
      return res.status(404).json({ error: 'Нет задач для этого турнира' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    
    // ✅ ИСПОЛЬЗУЕМ ТРАНСЛИТЕРАЦИЮ ДЛЯ ИМЕНИ ФАЙЛА
    const safeName = transliterate(team.name);
    res.setHeader('Content-Disposition', `attachment; filename=blanks_${safeName}.pdf`);

    // ... (остальной код генерации PDF без изменений) ...
    
    const fontPath = path.join(__dirname, '../../fonts/DejaVuSans.ttf');
    const doc = new PDFDocument({ size: 'A6', margin: 15 });
    
    doc.pipe(res);
    doc.font(fontPath);

    let isFirstPage = true;

    for (const task of tasks) {
      for (const multiplier of [1, 2, 3]) {
        if (!isFirstPage) doc.addPage();
        isFirstPage = false;

        doc.fontSize(10).fillColor('gray').text(`Команда: ${team.name}`, { align: 'center' });
        doc.moveDown(0.2);

        doc.fontSize(14).fillColor('black').text(`Задача: ${task.title}`, { align: 'center' });
        doc.moveDown(0.3);
        
        doc.fontSize(11).text(task.description, { align: 'center', width: doc.page.width - 30 });
        doc.moveDown(0.5);
        
        const color = multiplier === 1 ? 'black' : (multiplier === 2 ? 'blue' : 'red');
        doc.fontSize(18).fillColor(color).text(`Множитель: ×${multiplier}`, { align: 'center' });
        doc.moveDown(0.5);
        doc.fillColor('black');

        const qrPayload = {
          taskId: task.id,
          teamId: team.id,
          teamName: team.name,
          multiplier: multiplier,
          basePoints: task.maxPoints,
          taskTitle: task.title
        };

        const qrDataUrl = await QRCode.toDataURL(JSON.stringify(qrPayload), {
          width: 200, margin: 1, color: { dark: '#000000', light: '#ffffff' }
        });
        
        doc.image(qrDataUrl, { fit: [160, 160], align: 'center' });
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

export default router;