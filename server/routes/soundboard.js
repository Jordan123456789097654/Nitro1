const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function saveBase64Audio(base64Data) {
  try {
    const uploadDir = path.join(__dirname, '../../public/uploads/soundboard');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const matches = base64Data.match(/^data:([A-Za-z-+\/0-9]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return null;
    }

    const ext = matches[1].split('/')[1] || 'mp3';
    const filename = `sound-${crypto.randomBytes(8).toString('hex')}-${Date.now()}.${ext}`;
    const filepath = path.join(uploadDir, filename);

    fs.writeFileSync(filepath, Buffer.from(matches[2], 'base64'));
    return `/uploads/soundboard/${filename}`;
  } catch (e) {
    console.error('Error saving audio file:', e);
    return null;
  }
}

const { JWT_SECRET } = require('../secrets');

function authenticateToken(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.nitro_jwt_token) {
    token = req.cookies.nitro_jwt_token;
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid authentication session.' });
  }
}

// GET /api/soundboard - Fetch global and user custom soundboard sounds
router.get('/', async (req, res) => {
  try {
    let username = '';
    const authHeader = req.headers.authorization;
    let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : (req.cookies ? req.cookies.nitro_jwt_token : null);
    
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        username = decoded.username || '';
      } catch (e) {}
    }
    const sounds = await db.getSoundboardSounds(username);
    res.json({ success: true, sounds });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/soundboard/upload - Upload custom or global sound (Guests & Logged in)
router.post('/upload', async (req, res) => {
  try {
    const { title, icon, audioUrl, isGlobal } = req.body;
    if (!title || !audioUrl) {
      return res.status(400).json({ success: false, error: 'Title and audio URL/data are required.' });
    }

    let username = 'Guest';
    let isOwnerOrAdmin = false;

    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.nitro_jwt_token) {
      token = req.cookies.nitro_jwt_token;
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        username = decoded.username || 'Guest';
        const dbUser = await db.getUserByUsername(username);
        if (dbUser && (dbUser.role === 'owner' || dbUser.role === 'admin')) {
          isOwnerOrAdmin = true;
        }
      } catch (e) {}
    }

    const setGlobal = isOwnerOrAdmin ? (isGlobal === true || isGlobal === 'true') : false;

    let finalAudioUrl = audioUrl.trim();
    if (finalAudioUrl.startsWith('data:audio/')) {
      const savedPath = saveBase64Audio(finalAudioUrl);
      if (savedPath) {
        finalAudioUrl = savedPath;
      } else {
        return res.status(400).json({ success: false, error: 'Failed to process uploaded audio file.' });
      }
    }

    const newSound = await db.createSoundboardSound({
      title: title.trim().slice(0, 100),
      icon: (icon || '🎵').slice(0, 10),
      audioUrl: finalAudioUrl,
      isGlobal: setGlobal,
      uploadedBy: username
    });

    res.json({ success: true, sound: newSound });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/soundboard/:id - Delete a sound entry
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const soundId = parseInt(req.params.id);
    if (!soundId) return res.status(400).json({ success: false, error: 'Invalid sound ID' });

    const dbUser = await db.getUserByUsername(req.user.username);
    const isOwnerOrAdmin = dbUser && (dbUser.role === 'owner' || dbUser.role === 'admin');

    const success = await db.deleteSoundboardSound(soundId, req.user.username, isOwnerOrAdmin);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(403).json({ success: false, error: 'Permission denied or sound not found.' });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
