const crypto = require('crypto');
const { JWT_SECRET } = require('./secrets');

const ENCRYPTION_KEY = crypto.createHash('sha256').update(JWT_SECRET || 'NITRO_AES_SECRET_KEY_2026').digest();
const ALGORITHM = 'aes-256-gcm';

function encryptText(text) {
  if (!text || typeof text !== 'string') return text;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return 'enc_v1:' + iv.toString('hex') + ':' + authTag + ':' + encrypted;
  } catch (e) {
    return text;
  }
}

function decryptText(text) {
  if (!text || typeof text !== 'string') return text;
  if (!text.startsWith('enc_v1:')) return text;
  try {
    const parts = text.split(':');
    if (parts.length !== 4) return text;
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const encryptedText = parts[3];
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return '[Encrypted Message]';
  }
}

module.exports = { encryptText, decryptText };
