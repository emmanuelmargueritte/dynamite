const isEmail = (v) => {
  const s = String(v || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
};

const validate = (schema) => {
  return (req, res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema || {})) {
      const value = req.body?.[field];

      if (rules.required && (value === undefined || value === null || String(value).trim() === '')) {
        errors.push(`${field} is required`);
        continue;
      }

      if (value === undefined || value === null) continue;

      if (rules.type === 'email' && !isEmail(value)) errors.push(`${field} must be a valid email`);

      if (rules.type === 'string') {
        const s = String(value);
        if (rules.min && s.length < rules.min) errors.push(`${field} must be at least ${rules.min} chars`);
        if (rules.max && s.length > rules.max) errors.push(`${field} must be at most ${rules.max} chars`);
      }
    }

    if (errors.length) return res.status(400).json({ error: 'Validation error', details: errors });
    return next();
  };
};

module.exports = { validate };
