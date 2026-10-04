// Conexão com o Postgres (Supabase).
require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL no .env (copie o .env.example).');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // O Supabase exige SSL. Em um Postgres local, defina DATABASE_SSL=false.
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 10,
});

pool.on('error', (erro) => console.error('Erro inesperado no Postgres:', erro.message));

module.exports = pool;
