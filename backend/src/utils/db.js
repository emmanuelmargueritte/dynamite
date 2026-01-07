const { Pool } = require('pg');
const { env } = require('./env');

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false
});

module.exports = { pool };
