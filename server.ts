import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import Database from 'better-sqlite3';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

const PORT = 3000;
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const db = new Database('tactical_engine.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    originalName TEXT NOT NULL,
    mimeType TEXT NOT NULL,
    geminiUri TEXT NOT NULL,
    geminiName TEXT NOT NULL,
    status TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const upload = multer({ dest: UPLOADS_DIR });

async function startServer() {
  const app = express();
  app.use(express.json());

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/files', async (req, res) => {
    const files = db.prepare('SELECT * FROM files ORDER BY createdAt DESC').all() as any[];
    
    // Check status for processing files
    for (const file of files) {
      if (file.status === 'PROCESSING') {
        try {
          const geminiFile = await ai.files.get({ name: file.geminiName });
          if (geminiFile.state !== file.status) {
            db.prepare('UPDATE files SET status = ? WHERE id = ?').run(geminiFile.state, file.id);
            file.status = geminiFile.state;
          }
        } catch (error) {
          console.error(`Failed to check status for ${file.geminiName}:`, error);
        }
      }
    }
    
    res.json(files);
  });

  app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      console.log(`Uploading ${req.file.originalname} to Gemini...`);
      const uploadResult = await ai.files.upload({
        file: req.file.path,
        config: {
          mimeType: req.file.mimetype,
          displayName: req.file.originalname,
        }
      });

      const stmt = db.prepare(`
        INSERT INTO files (filename, originalName, mimeType, geminiUri, geminiName, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      const info = stmt.run(
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        uploadResult.uri,
        uploadResult.name,
        uploadResult.state || 'PROCESSING'
      );

      // Clean up local file
      fs.unlinkSync(req.file.path);

      res.json({ id: info.lastInsertRowid, status: 'success' });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Failed to upload file to Gemini' });
    }
  });

  app.post('/api/files/:id/check-status', async (req, res) => {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id) as any;
    if (!file) return res.status(404).json({ error: 'File not found' });

    try {
      const geminiFile = await ai.files.get({ name: file.geminiName });
      if (geminiFile.state !== file.status) {
        db.prepare('UPDATE files SET status = ? WHERE id = ?').run(geminiFile.state, file.id);
      }
      res.json({ status: geminiFile.state });
    } catch (error) {
      console.error('Status check error:', error);
      res.status(500).json({ error: 'Failed to check status' });
    }
  });

  app.delete('/api/files/:id', async (req, res) => {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id) as any;
    if (!file) return res.status(404).json({ error: 'File not found' });

    try {
      await ai.files.delete({ name: file.geminiName });
      db.prepare('DELETE FROM files WHERE id = ?').run(file.id);
      res.json({ status: 'success' });
    } catch (error) {
      console.error('Delete error:', error);
      res.status(500).json({ error: 'Failed to delete file' });
    }
  });

  app.post('/api/search', async (req, res) => {
    const { query, fileIds } = req.body;
    if (!query || !fileIds || !fileIds.length) {
      return res.status(400).json({ error: 'Query and fileIds are required' });
    }

    try {
      const placeholders = fileIds.map(() => '?').join(',');
      const files = db.prepare(`SELECT * FROM files WHERE id IN (${placeholders})`).all(...fileIds) as any[];

      const parts: any[] = files.map(f => ({
        fileData: {
          fileUri: f.geminiUri,
          mimeType: f.mimeType
        }
      }));

      parts.push({ text: query });

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: { parts },
        config: {
          systemInstruction: "You are an advanced football tactical analyst. Analyze the provided match videos, press conference audio, and tactical PDFs. When answering the user's query, provide specific timestamps from the video and audio, and reference the PDF where applicable. Format your response in Markdown with clear headings and bullet points.",
        }
      });

      res.json({ result: response.text });
    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Failed to perform search' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
