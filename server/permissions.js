// server/permissions.js
// Centralizes the "is this user the Owner / an Admin?" checks that were
// previously copy-pasted (with the hardcoded username 'jordandaniels') in
// 10+ places across server/routes/admin.js and elsewhere. Having one
// definition makes the privilege model auditable and means a future change
// (e.g. removing the username-based override entirely once every deployment
// has `role = 'owner'` set correctly in the DB) only has to happen once.

function isOwner(user) {
  if (!user) return false;
  return user.role === 'owner' || (user.username || '').toLowerCase() === 'jordandaniels';
}

function isModeratorOrOwner(user) {
  if (!user) return false;
  return ['moderator', 'owner'].includes(user.role) || isOwner(user);
}

module.exports = { isOwner, isModeratorOrOwner };
