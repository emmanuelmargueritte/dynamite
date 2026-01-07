const { pool } = require('../utils/db');

module.exports = {
  async findByEmail(email) {
    const { rows } = await pool.query(`SELECT * FROM admins WHERE email=$1`, [email]);
    return rows[0];
  },

  async count() {
    const { rows } = await pool.query(`SELECT COUNT(*) FROM admins`);
    return Number(rows[0].count);
  }
};
