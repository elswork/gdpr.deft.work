const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'file-' + uniqueSuffix + '.enc');
  }
});

const upload = multer({ storage: storage });

app.post('/api/upload', upload.single('encryptedFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }
  
  // Enviar notificación Push mediante ntfy.sh usando el módulo https nativo (sin dependencias)
  try {
    const https = require('https');
    const data = 'Se ha recibido un nuevo formulario cifrado de un miembro del ICE.';
    
    const options = {
      hostname: 'ntfy.sh',
      port: 443,
      path: '/deft_work_gdpr_alerts_hq',
      method: 'POST',
      headers: {
        'Title': 'Nuevo Documento GDPR',
        'Tags': 'lock,page_facing_up',
        'Priority': 'default',
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const reqNtfy = https.request(options, (resNtfy) => {
      console.log(`Ntfy response statusCode: ${resNtfy.statusCode}`);
    });

    reqNtfy.on('error', (error) => {
      console.error('Error al enviar notificación con ntfy:', error);
    });

    reqNtfy.write(data);
    reqNtfy.end();
  } catch (e) {
    console.error('Error general de notificación ntfy:', e);
  }

  res.json({ message: 'Archivo subido y guardado de forma segura', filename: req.file.filename });
});

app.get('/api/files', (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'No se pudieron listar los archivos' });
    }
    const encFiles = files.filter(f => f.endsWith('.enc')).map(f => {
      const stats = fs.statSync(path.join(UPLOAD_DIR, f));
      return {
        name: f,
        size: stats.size,
        date: stats.mtime
      };
    }).sort((a, b) => b.date - a.date);
    res.json(encFiles);
  });
});

app.get('/api/files/:filename', (req, res) => {
  const filename = req.params.filename;
  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).send('Invalid filename');
  }
  const filePath = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('File not found');
  }
});

app.delete('/api/files/:filename', (req, res) => {
  const filename = req.params.filename;
  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).send('Invalid filename');
  }
  const filePath = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ message: 'File deleted successfully' });
  } else {
    res.status(404).send('File not found');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor de recogida de datos GDPR escuchando en http://localhost:${PORT}`);
});
