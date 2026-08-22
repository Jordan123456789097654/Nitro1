const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.SESSION_SECRET || 'nitro_jwt_secure_key_2026';

// Helper to authenticate request
async function getAuthUser(req) {
  if (req.user) return req.user;

  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return await db.getUserByUsername(decoded.username);
  } catch (e) {
    return null;
  }
}

// GET /api/raffles - List all raffles
router.get('/', async (req, res) => {
  const user = await getAuthUser(req);
  try {
    const raffles = await db.getRaffles(user ? user.id : 0);
    res.json({ success: true, raffles });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch raffles.' });
  }
});

// POST /api/raffles/:id/buy - Buy raffle ticket(s)
router.post('/:id/buy', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized. Please sign in.' });

  const raffleId = req.params.id;
  const { count = 1 } = req.body;

  const ticketCount = parseInt(count, 10);
  if (isNaN(ticketCount) || ticketCount <= 0) {
    return res.status(400).json({ error: 'Invalid ticket count.' });
  }

  try {
    const result = await db.buyRaffleTickets(user.id, raffleId, ticketCount);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({
      success: true,
      message: `Successfully purchased ${ticketCount} raffle ticket(s)!`,
      ...result
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to complete ticket transaction.' });
  }
});

module.exports = router;
