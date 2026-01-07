const sanitizeText = (v, maxLen = 5000) => {
  if (v === undefined || v === null) return '';
  const s = String(v).trim();
  if (s.length > maxLen) return s.slice(0, maxLen);
  return s;
};

const sanitizeEmail = (v) => {
  const s = sanitizeText(v, 254).toLowerCase();
  return s;
};

module.exports = { sanitizeText, sanitizeEmail };
