const assertIntXpf = (n, fieldName = 'amount_xpf') => {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 0) {
    const err = new Error(`${fieldName} must be a non-negative integer (XPF, no cents)`);
    err.statusCode = 400;
    throw err;
  }
  return v;
};

const sumInt = (arr) => arr.reduce((a, b) => a + b, 0);

module.exports = { assertIntXpf, sumInt };
