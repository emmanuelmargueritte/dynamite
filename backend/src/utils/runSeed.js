require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../../sql/seed.sql'), 'utf8');
  await pool.query(sql);
  console.log('🌱 Seed exécuté');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
