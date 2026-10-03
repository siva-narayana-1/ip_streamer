'use strict';
const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'rtsp_viewer',
      },
);

const COLS = 'id, name, protocol, ip, port, username, password, path, location, quality, created_at AS "createdAt"';

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cameras (
      id         UUID PRIMARY KEY,
      name       TEXT NOT NULL,
      protocol   TEXT NOT NULL DEFAULT 'rtsp',
      ip         TEXT NOT NULL DEFAULT '',
      port       INTEGER NOT NULL DEFAULT 554,
      username   TEXT NOT NULL DEFAULT '',
      password   TEXT NOT NULL DEFAULT '',
      path       TEXT NOT NULL DEFAULT '',
      location   TEXT NOT NULL DEFAULT '',
      quality    TEXT NOT NULL DEFAULT 'medium' CHECK (quality IN ('low','medium','high')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  // migrate from the older single-URL schema
  await pool.query(`
    ALTER TABLE cameras
      ADD COLUMN IF NOT EXISTS protocol TEXT NOT NULL DEFAULT 'rtsp',
      ADD COLUMN IF NOT EXISTS ip TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS port INTEGER NOT NULL DEFAULT 554,
      ADD COLUMN IF NOT EXISTS username TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS password TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS path TEXT NOT NULL DEFAULT '',
      DROP COLUMN IF EXISTS url`);
}

const listCameras = async () => (await pool.query(`SELECT ${COLS} FROM cameras ORDER BY created_at`)).rows;

const insertCamera = async (c) =>
  (await pool.query(
    `INSERT INTO cameras (id, name, protocol, ip, port, username, password, path, location, quality) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${COLS}`,
    [c.id, c.name, c.protocol, c.ip, c.port, c.username, c.password, c.path, c.location, c.quality],
  )).rows[0];

const updateCamera = async (id, c) =>
  (await pool.query(
    `UPDATE cameras SET name=$2, protocol=$3, ip=$4, port=$5, username=$6, password=$7, path=$8, location=$9, quality=$10 WHERE id=$1 RETURNING ${COLS}`,
    [id, c.name, c.protocol, c.ip, c.port, c.username, c.password, c.path, c.location, c.quality],
  )).rows[0];

const deleteCamera = (id) => pool.query('DELETE FROM cameras WHERE id=$1', [id]);

module.exports = { pool, init, listCameras, insertCamera, updateCamera, deleteCamera };
