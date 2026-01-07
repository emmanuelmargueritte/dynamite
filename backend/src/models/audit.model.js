const { pool } = require('../utils/db');

module.exports = {
  async log(adminId, action, ip) {
    await pool.query(
      `INSERT INTO audit_logs (admin_id, action, ip_address) VALUES ($1,$2,$3)`,
      [adminId, action, ip]
    );
  }
};
