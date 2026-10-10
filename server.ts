import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import ffmpegStatic from 'ffmpeg-static';
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'outputs');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const upload = multer({ dest: uploadDir });

// Store active task progress globally
const tasks = new Map<string, { progress: number; status: string; outputUrl?: string; error?: string }>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API to start video processing
  app.post('/api/process', upload.single('video'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const speed = parseFloat(req.body.speed || '1.5');
    const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    
    const inputPath = req.file.path;
    const outputPath = path.join(outputDir, `${taskId}.mp4`);

    tasks.set(taskId, { progress: 0, status: 'Analyzing video...' });

    // Send taskId immediately to client
    res.json({ taskId });

    // Run processing in background
    processVideoAsync(taskId, inputPath, outputPath, speed);
  });

  // Task status polling
  app.get('/api/status/:taskId', (req, res) => {
    const { taskId } = req.params;
    const task = tasks.get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  });

  // Download endpoint
  app.get('/api/download/:taskId', (req, res) => {
    const { taskId } = req.params;
    const outputPath = path.join(outputDir, `${taskId}.mp4`);
    if (!fs.existsSync(outputPath)) {
      return res.status(404).json({ error: 'Processed video not found' });
    }
    res.download(outputPath, 'processed_video.mp4', (err) => {
      if (err) console.error('Download error:', err);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

function processVideoAsync(taskId: string, inputPath: string, outputPath: string, speed: number) {
  const ffmpegPath = ffmpegStatic || 'ffmpeg';

  try {
    let totalDuration = 0;
    try {
      const ffprobeOutput = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`, { encoding: 'utf-8' });
      totalDuration = parseFloat(ffprobeOutput.trim());
    } catch (e) {
      console.warn('Could not determine duration with ffprobe:', e);
    }

    const videoSpeed = 1 / speed;
    const audioSpeed = speed;

    const args = [
      '-i', inputPath,
      '-filter_complex', `[0:v]setpts=${videoSpeed}*PTS[v];[0:a]atempo=${audioSpeed}[a]`,
      '-map', '[v]', '-map', '[a]',
      '-vcodec', 'libx264', '-crf', '28', '-preset', 'fast',
      '-movflags', '+faststart',
      '-y', outputPath
    ];

    const child = spawn(ffmpegPath, args);

    child.stderr.on('data', (data) => {
      const line = data.toString();
      if (line.includes('time=') && totalDuration > 0) {
        const match = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (match) {
          const h = parseInt(match[1], 10);
          const m = parseInt(match[2], 10);
          const s = parseFloat(match[3]);
          const elapsed = h * 3600 + m * 60 + s;
          const percent = Math.min(Math.round((elapsed / totalDuration) * 100), 99);
          tasks.set(taskId, { progress: percent, status: `Processing... ${percent}%` });
        }
      }
    });

    child.on('close', (code) => {
      try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch (e) {}

      if (code === 0 && fs.existsSync(outputPath)) {
        tasks.set(taskId, { progress: 100, status: 'Complete!', outputUrl: `/api/download/${taskId}` });
      } else {
        tasks.set(taskId, { progress: 0, status: 'Error', error: `FFmpeg exited with code ${code}` });
      }
    });

    child.on('error', (err) => {
      try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch (e) {}
      tasks.set(taskId, { progress: 0, status: 'Error', error: err.message });
    });

  } catch (err: any) {
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch (e) {}
    tasks.set(taskId, { progress: 0, status: 'Error', error: err.message || 'Unknown error' });
  }
}

startServer();
