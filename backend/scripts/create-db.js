'use strict';
// Creates the database named in .env if it does not exist yet.
require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const name = process.env.DB_NAME || 'rtsp_viewer';
  if (!/^\w+$/.test(name)) throw new Error('DB_NAME may only contain letters, numbers and underscores.');
  const c = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  });
  await c.connect();
  const { rowCount } = await c.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
  if (rowCount) console.log(`Database "${name}" already exists.`);
  else { await c.query(`CREATE DATABASE "${name}"`); console.log(`Created database "${name}".`); }
  await c.end();
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
