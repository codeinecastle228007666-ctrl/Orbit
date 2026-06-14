const path = require('path');
const fs = require('fs');

const TEST_DB = path.resolve(__dirname, '..', 'data', 'test-orbit.db');
const PORT = 3099;

export async function setup() {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  fs.writeFileSync(TEST_DB, Buffer.from(db.export()));

  process.env.TEST_DB_PATH = TEST_DB;
  process.env.PORT = String(PORT);

  // server.js will export app but NOT start when TEST_DB_PATH is set
  const { app, start } = require('../server');

  // Manually start with test DB
  await start();

  const request = require('supertest')(app);

  return { server: app, request, dbPath: TEST_DB, port: PORT };
}

export async function teardown() {
  delete process.env.TEST_DB_PATH;
  delete process.env.PORT;
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
}

export { TEST_DB, PORT };
