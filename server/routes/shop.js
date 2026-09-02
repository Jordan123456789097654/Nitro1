const express = require('express');
const router = express.Router();
const db = require('../db');
const pool = db.pool;
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../secrets');

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

// GET /api/shop/stores/:id - Get a store's info and its items
router.get('/stores/:id', async (req, res) => {
  try {
    const store = await db.getStoreById(req.params.id);
    if (!store || !store.is_active) {
      return res.status(404).json({ error: 'Shop not found.' });
    }
    const items = await db.getStoreItems(req.params.id);
    res.json({ success: true, store, items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shop.' });
  }
});

// POST /api/shop/buy - Purchase shop item
router.post('/buy', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized. Please sign in.' });

  if (user.is_shop_banned) {
    return res.status(403).json({ error: 'Your shop purchase privileges have been suspended by an administrator.' });
  }

  const { itemId } = req.body;
  if (!itemId) return res.status(400).json({ error: 'Item ID is required.' });

  try {
    const result = await db.purchaseShopItem(user.id, itemId);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    // Update quest progress
    await db.updateQuestProgress(user.id, 'buy_shop');

    res.json({
      success: true,
      message: `Successfully purchased "${result.item.name}"!`,
      item: result.item
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to complete purchase transaction.' });
  }
});

// POST /api/shop/redeem - Redeem promo code
router.post('/redeem', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized. Please sign in.' });

  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Promo code is required.' });

  try {
    const result = await db.redeemPromoCode(user.id, code);
    
    await db.createModerationLog('PROMO_CODE_REDEEM', user.username, code.toUpperCase(), result.details);

    res.json({
      success: true,
      message: `Successfully redeemed code! ${result.details}`,
      reward_type: result.reward_type,
      reward_value: result.reward_value
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to redeem promo code.' });
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

// GET /api/shop/spin-segments - Public: get spin wheel segments for rendering
router.get('/spin-segments', async (req, res) => {
  try {
    const segments = await db.getSpinWheelSegments();
    res.json({ success: true, segments });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch spin segments.' });
  }
});

// POST /api/shop/spin - Spin the daily rewards wheel
router.post('/spin', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized. Please sign in.' });

  try {
    const result = await db.claimDailySpin(user.id);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to process daily spin request.' });
  }
});

// POST /api/shop/equip - Equip or unequip an owned shop item
router.post('/equip', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const { itemId, action } = req.body; // action: 'equip' or 'unequip'
  if (!itemId) return res.status(400).json({ error: 'Item ID is required.' });

  try {
    // Verify user owns the item
    const invCheck = await pool.query(`
      SELECT i.*, s.category, s.perk_value 
      FROM user_inventory i 
      JOIN shop_items s ON i.item_id = s.id 
      WHERE i.user_id = $1 AND i.item_id = $2
    `, [user.id, itemId]);

    if (!invCheck.rows.length) {
      return res.status(400).json({ error: 'You do not own this item.' });
    }

    const item = invCheck.rows[0];
    const category = item.category;
    const perkValue = item.perk_value;

    let updateField = null;
    if (category === 'chat_glow') updateField = 'pro_chat_glow';
    else if (category === 'custom_flair') updateField = 'pro_custom_flair';
    else if (category === 'avatar_border') updateField = 'avatar_border';
    else if (category === 'profile_banner') updateField = 'profile_banner';
    else if (category === 'chat_font') updateField = 'chat_font';

    if (!updateField) {
      return res.status(400).json({ error: 'This item type cannot be equipped.' });
    }

    const valueToSet = action === 'unequip' ? '' : perkValue;

    // Update user profile setting
    await pool.query(`UPDATE users SET ${updateField} = $1 WHERE id = $2`, [valueToSet, user.id]);

    res.json({
      success: true,
      message: action === 'unequip' ? 'Unequipped item successfully!' : 'Equipped item successfully!',
      category,
      value: valueToSet
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle equipment status.' });
  }
});

// POST /api/shop/buy-premium - Purchase 30 days of Premium for 1,000 coins
router.post('/buy-premium', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized. Please sign in.' });

  const PRICE = 1000;
  if ((user.coins || 0) < PRICE) {
    return res.status(400).json({ error: 'Not enough coins. Premium costs 1000 coins.' });
  }

  try {
    const newCoins = user.coins - PRICE;
    await pool.query('UPDATE users SET coins = $1 WHERE id = $2', [newCoins, user.id]);
    await db.buyPremium(user.id, 30);

    res.json({
      success: true,
      message: '🎉 Nitro Premium Pass activated! Enjoy your premium perks.',
      newCoins
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to purchase Premium Pass.' });
  }
});

module.exports = router;
