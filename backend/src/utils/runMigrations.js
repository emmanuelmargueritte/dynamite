require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../../sql/migrations.sql'), 'utf8');
  await pool.query(sql);
  console.log('✅ Migrations exécutées');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
