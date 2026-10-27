const crypto = require('crypto');
const prisma = require('../config/database');

// Lowercase a-z only so IDs are easy to type; falls back when the name has no latin letters
const slug = (value, fallback) => (value || '').toLowerCase().replace(/[^a-z]/g, '') || fallback;

const digits = (n) => String(crypto.randomInt(0, 10 ** n)).padStart(n, '0');

// Login ID from the first name, e.g. "Manvi" → "manvi@09". Widens the number if the short ones are taken.
const generateUsername = async (firstName, lastName) => {
  const base = slug(firstName, slug(lastName, 'student'));
  for (let attempt = 0; attempt < 40; attempt++) {
    const username = `${base}@${digits(attempt < 20 ? 2 : attempt < 30 ? 3 : 4)}`;
    const exists = await prisma.user.findFirst({
      where: { OR: [{ username }, { email: studentEmail(username) }] },
    });
    if (!exists) return username;
  }
  return `${base}@${Date.now().toString().slice(-6)}`;
};

// Internal placeholder email (students log in with the username); never emailed or shown
const PLACEHOLDER_EMAIL_DOMAIN = '@students.derivion.local';
const studentEmail = (username) => `${username.replace('@', '.')}${PLACEHOLDER_EMAIL_DOMAIN}`;
const isPlaceholderEmail = (email) => typeof email === 'string' && email.toLowerCase().endsWith(PLACEHOLDER_EMAIL_DOMAIN);

// Memorable password from the name, e.g. "Manvi@4827"
const generatePassword = (firstName, lastName) => {
  const base = slug(firstName, slug(lastName, 'student'));
  return `${base.charAt(0).toUpperCase()}${base.slice(1)}@${digits(4)}`;
};

module.exports = { generateUsername, generatePassword, studentEmail, isPlaceholderEmail };
