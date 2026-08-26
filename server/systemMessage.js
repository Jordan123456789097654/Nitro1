// server/systemMessage.js
//
// BUGFIX: platform events (tournament hosted/closed, raffle winner drawn, score
// approved, etc.) used to build a fake chat message object client-side —
// random id via Date.now()+Math.random(), never written to chat_messages —
// and just io.emit() it directly. That meant:
//   1. It never actually "adds the message to the database" as intended, so
//      anyone who reloads the page or wasn't connected at that exact moment
//      never sees it — getGlobalMessages() only reads from the DB.
//   2. It was tagged role: 'admin', so it rendered as a normal admin chat
//      bubble instead of a distinct system announcement.
//
// This helper actually persists the message (so it shows up in chat history
// like any other message) and broadcasts the real saved row — same shape a
// normal message has — to everyone currently connected.

const db = require('./db');

async function postSystemMessage(io, text) {
  try {
    const saved = await db.createChatMessage(null, 'System', 'system', text);
    if (io) io.emit('new_message', saved);
    return saved;
  } catch (e) {
    console.error('postSystemMessage error:', e.message);
    return null;
  }
}

module.exports = { postSystemMessage };
