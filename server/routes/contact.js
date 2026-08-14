const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const db = require('../db');
const { sendDiscordLog } = require('../discordLogger');

const departmentEmailMap = {
  legal: 'legal@nitromath.org',
  ownership: 'jordan@nitromath.org',
  support: 'support@nitromath.org'
};

let cachedTransporter = null;

async function getTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (user && pass) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: parseInt(process.env.SMTP_PORT, 10) === 465,
      auth: { user, pass }
    });
  }

  if (!cachedTransporter) {
    try {
      const testAccount = await nodemailer.createTestAccount();
      cachedTransporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      console.log(`✉️ Zero-Config SMTP Email Dispatcher Active: ${testAccount.user}`);
    } catch (e) {
      cachedTransporter = nodemailer.createTransport({ jsonTransport: true });
    }
  }

  return cachedTransporter;
}

// Submit Contact Message
router.post('/submit', async (req, res) => {
  const { name, email, department, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'All fields (Name, Email, Subject, Message) are required.' });
  }

  const cleanDept = department || 'support';
  const targetEmail = departmentEmailMap[cleanDept] || 'support@nitromath.org';

  try {
    // 1. Save to Database
    const newMail = await db.createContactMessage(name.trim(), email.trim(), cleanDept, subject.trim(), message.trim());

    // 2. Dispatch Email via Nodemailer
    const transporter = await getTransporter();
    const mailOptions = {
      from: `"${name.trim()}" <${process.env.SMTP_USER || 'noreply@nitromath.org'}>`,
      replyTo: email.trim(),
      to: targetEmail,
      subject: `[NITRO ${cleanDept.toUpperCase()}] ${subject.trim()}`,
      text: `New Contact Submission:\n\nName: ${name}\nSender Email: ${email}\nDepartment: ${cleanDept} (${targetEmail})\nSubject: ${subject}\n\nMessage:\n${message}\n\n--- Sent via NITRO Math Platform ---`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background: #0f172a; color: #f8fafc; border-radius: 8px;">
          <h2 style="color: #38bdf8; margin-top: 0;">📩 New NITRO Contact Inquiry</h2>
          <p><strong>Department:</strong> ${cleanDept} (<code>${targetEmail}</code>)</p>
          <p><strong>From:</strong> ${name} (&lt;<a href="mailto:${email}" style="color: #fbbf24;">${email}</a>&gt;)</p>
          <p><strong>Subject:</strong> ${subject}</p>

          <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;">

          <h3 style="color: #cbd5e1;">Message:</h3>
          <p style="background: #1e293b; padding: 15px; border-radius: 6px; white-space: pre-wrap; line-height: 1.5;">${message}</p>

          <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;">
          <p style="font-size: 0.8rem; color: #94a3b8;">Sent via NITRO Web Platform</p>
        </div>
      `
    };

    let emailSent = false;
    let previewUrl = null;
    try {
      const info = await transporter.sendMail(mailOptions);
      emailSent = true;
      previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`✉️ Contact email dispatched to ${targetEmail}${previewUrl ? ' | Preview: ' + previewUrl : ''}`);
    } catch (mailErr) {
      console.warn(`⚠️ SMTP Dispatch notice: ${mailErr.message}`);
    }

    // 3. Discord Webhook Log
    sendDiscordLog({
      category: 'contact',
      action: 'CONTACT_FORM_SUBMITTED',
      admin: name,
      target: targetEmail,
      details: `[${cleanDept.toUpperCase()}] ${subject} - From: ${name} (${email}): ${message}`
    });

    res.json({
      success: true,
      message: `Your inquiry has been submitted and sent to ${targetEmail}!`,
      targetEmail,
      emailSent,
      inquiry: newMail
    });
  } catch (err) {
    console.error('Contact submission error:', err);
    res.status(500).json({ error: 'Failed to submit contact inquiry.' });
  }
});

module.exports = router;
