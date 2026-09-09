const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name TEXT, price NUMERIC, image TEXT, category TEXT)`);
    const check = await pool.query('SELECT COUNT(*) FROM products');
    if (parseInt(check.rows[0].count) === 0) {
      await pool.query(`INSERT INTO products (name, price, image, category) VALUES
        ('GC Coins Pack - 10K', 5.99, 'https://i.imgur.com/8QJ4sQw.png', 'currency'),
        ('VIP Rank - 30 Days', 14.99, 'https://i.imgur.com/8QJ4sQw.png', 'vip'),
        ('Luxury Sports Car', 29.99, 'https://i.imgur.com/8QJ4sQw.png', 'cars'),
        ('Billionaire Mansion', 49.99, 'https://i.imgur.com/8QJ4sQw.png', 'property')`);
    }
    const result = await pool.query('SELECT * FROM products ORDER BY id');
    res.status(200).json({ success: true, products: result.rows, backend: 'Vercel Edge + Neon Global', status: '🟢 GLOBAL EDGE LIVE - ' + result.rows.length + ' products - Vercel + Neon - Never Sleeps' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
