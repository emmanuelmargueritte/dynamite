const { pool } = require('../utils/db');

module.exports = {
  async countActive() {
    const { rows } = await pool.query(`SELECT COUNT(*) FROM sessions WHERE expire > NOW()`);
    return Number(rows[0].count);
  }
};
