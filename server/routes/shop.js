const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.SESSION_SECRET || 'nitro_jwt_secure_key_2026';

// Helper to authenticate request and get DB user
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

// GET /api/shop/items - List all active items in the shop
router.get('/items', async (req, res) => {
  try {
    const items = await db.getShopItems();
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shop items.' });
  }
});

// POST /api/shop/buy - Purchase shop item
router.post('/buy', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized. Please sign in.' });

  const { itemId } = req.body;
  if (!itemId) return res.status(400).json({ error: 'Item ID is required.' });

  try {
    const result = await db.purchaseShopItem(user.id, itemId);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      message: `Successfully purchased "${result.item.name}"!`,
      item: result.item
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to complete purchase transaction.' });
  }
});

// GET /api/shop/inventory - Get user inventory
router.get('/inventory', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  try {
    const inventory = await db.getUserInventory(user.id);
    res.json({ success: true, inventory });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve inventory.' });
  }
});

// GET /api/shop/quests - Get active quests with progress
router.get('/quests', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  try {
    const quests = await db.getQuests(user.id);
    res.json({ success: true, quests });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch quests.' });
  }
});

// POST /api/shop/quests/:id/claim - Claim quest reward
router.post('/quests/:id/claim', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const questId = req.params.id;

  try {
    const result = await db.claimQuestReward(user.id, questId);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      message: `Claimed quest reward: +${result.reward_coins} Coins, +${result.reward_xp} XP!`,
      reward_coins: result.reward_coins,
      reward_xp: result.reward_xp
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to claim reward.' });
  }
});

// POST /api/shop/quests/trigger - Update progress for a specific quest type
router.post('/quests/trigger', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.json({ success: false, error: 'Not logged in.' });

  const { questType, incrementBy = 1 } = req.body;
  if (!questType) return res.status(400).json({ error: 'Quest type is required.' });

  try {
    await db.updateQuestProgress(user.id, questType, incrementBy);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update quest progress.' });
  }
});

module.exports = router;
