const safe = (v) => {
  try {
    if (v instanceof Error) {
      return { name: v.name, message: v.message, stack: v.stack };
    }
    return v;
  } catch {
    return String(v);
  }
};

const log = (level, msg, meta) => {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta !== undefined ? { meta: safe(meta) } : {})
  };
  console.log(JSON.stringify(payload));
};

module.exports = {
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta)
};
