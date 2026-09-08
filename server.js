const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/', (req,res)=> res.json({message:'GBC MOBILE Backend Live', neon:'ep-lucky-cloud-aeyrscx9'}));
app.get('/health', (req,res)=> res.json({status:'ok'}));

app.get('/api/products', async (req,res)=>{
  const r = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
  res.json(r.rows);
});
app.post('/api/products', async (req,res)=>{
  const {name, gc_price, stock, image_url} = req.body;
  const r = await pool.query('INSERT INTO products (name, gc_price, stock, image_url) VALUES ($1,$2,$3,$4) RETURNING *', [name, gc_price, stock, image_url]);
  res.json(r.rows[0]);
});
app.delete('/api/products/:id', async (req,res)=>{
  await pool.query('DELETE FROM products WHERE id=$1', [req.params.id]);
  res.json({ok:true});
});
app.post('/api/orders', async (req,res)=>{
  const {rp_name, email, items, total_gc} = req.body;
  const total_usd = (total_gc * 0.27).toFixed(2);
  const tx = 'TX'+Date.now();
  const r = await pool.query('INSERT INTO orders (rp_name, email, items, total_gc, total_usd, transaction_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [rp_name, email, JSON.stringify(items), total_gc, total_usd, tx]);
  res.json(r.rows[0]);
});
app.post('/api/auth/login', async (req,res)=>{
  const {username, password} = req.body;
  if(username==='owner' && password==='GBC2026!') return res.json({role:'owner', username:'owner', displayName:'Owner'});
  const r = await pool.query('SELECT * FROM staffs WHERE username=$1 AND password=$2', [username, password]);
  if(r.rows[0]) return res.json({role:'staff', username:r.rows[0].username, displayName:r.rows[0].name});
  res.status(400).json({error:'Invalid'});
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, ()=> console.log('Live on '+PORT));
