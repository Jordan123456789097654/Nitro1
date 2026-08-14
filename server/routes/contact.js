const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendDiscordLog } = require('../discordLogger');

const departmentEmailMap = {
  legal: 'legal@nitromath.org',
  ownership: 'jordan@nitromath.org',
  support: 'support@nitromath.org'
};

// Submit Contact Message
router.post('/submit', async (req, res) => {
  const { name, email, department, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'All fields (Name, Email, Subject, Message) are required.' });
  }

  const cleanDept = department || 'support';
  const targetEmail = departmentEmailMap[cleanDept] || 'support@nitromath.org';

  try {
    const newMail = await db.createContactMessage(name.trim(), email.trim(), cleanDept, subject.trim(), message.trim());

    sendDiscordLog({
      category: 'contact',
      action: 'CONTACT_FORM_SUBMITTED',
      admin: name,
      target: targetEmail,
      details: `[o${cleanDept}] ${subject} - From: ${name} (${email}): ${message}`
    });

    res.json({
      success: true,
      message: `Your inquiry has been sent to ${targetEmail}. We will respond shortly!`,
      targetEmail,
      inquiry: newMail
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit contact inquiry.' });
  }
});

module.exports = router;
