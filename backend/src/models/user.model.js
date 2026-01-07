const { pool } = require('../utils/db');

module.exports = {
  async create(email, passwordHash) {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ($1,$2) RETURNING *`,
      [email, passwordHash]
    );
    return rows[0];
  }
};
