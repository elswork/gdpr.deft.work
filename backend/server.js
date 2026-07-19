const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const COOKIE_NAME = 'gdpr_admin_session';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function requireAuth(req, res, next) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(cookieHeader.split('; ').map(c => {
    const parts = c.split('=');
    return [parts[0], parts.slice(1).join('=')];
  }));
  
  if (cookies[COOKIE_NAME] === ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    // Set cookie valid for 24 hours
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${password}; Path=/; HttpOnly; Max-Age=86400`);
    res.redirect('/');
  } else {
    res.redirect('/login.html?error=1');
  }
});

app.get('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
  res.redirect('/login.html');
});


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
  
  // Enviar notificación Push mediante ntfy.sh
  try {
    const ntfyUrl = 'https://ntfy.sh/deft_work_gdpr_alerts_hq';
    
    // Usamos el fetch nativo de Node 18+
    if (typeof fetch !== 'undefined') {
      fetch(ntfyUrl, {
        method: 'POST',
        body: 'Se ha recibido un nuevo formulario cifrado de un miembro del ICE.',
        headers: {
          'Title': 'Nuevo Documento GDPR',
          'Tags': 'lock,page_facing_up',
          'Priority': 'default'
        }
      }).catch(err => console.error('Error al enviar notificación:', err));
    }
  } catch (e) {
    console.error('Fetch no está disponible o falló:', e);
  }

  res.json({ message: 'Archivo subido y guardado de forma segura', filename: req.file.filename });
});

app.get('/api/files', requireAuth, (req, res) => {
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

app.get('/api/files/:filename', requireAuth, (req, res) => {
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

app.delete('/api/files/:filename', requireAuth, (req, res) => {
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
