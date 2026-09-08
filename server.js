
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json({limit:'10mb'}));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'player',
      display_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS players (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      username TEXT,
      display_name TEXT,
      level INT DEFAULT 1,
      gc_balance INT DEFAULT 0,
      vip TEXT DEFAULT 'none',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      title TEXT,
      category TEXT DEFAULT 'gc',
      gc_price INT NOT NULL,
      price INT,
      stock INT DEFAULT 999,
      image_url TEXT,
      description TEXT,
      tag TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_id TEXT UNIQUE NOT NULL,
      transaction_id TEXT,
      user_id INT REFERENCES users(id),
      rp_name TEXT,
      username TEXT,
      email TEXT,
      items JSONB,
      item_title TEXT,
      item_price INT,
      total_gc INT,
      total_usd NUMERIC,
      status TEXT DEFAULT 'pending',
      receipt_path TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS staff (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id),
      level INT DEFAULT 1,
      role TEXT DEFAULT 'support',
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id SERIAL PRIMARY KEY,
      bank_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      account_name TEXT NOT NULL,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // Ensure owner exists
  const owner = await pool.query("SELECT * FROM users WHERE username='owner'");
  if(owner.rows.length===0){
    const hash = await bcrypt.hash('GBC2026!',10);
    const u = await pool.query("INSERT INTO users (username,email,password_hash,role,display_name) VALUES ('owner','owner@gbc.city',$1,'owner','Owner') RETURNING id",[hash]);
    await pool.query("INSERT INTO staff (user_id,level,role,active) VALUES ($1,10,'owner',true)",[u.rows[0].id]);
  }
  // Seed products if empty
  const pcount = await pool.query("SELECT COUNT(*) FROM products");
  if(parseInt(pcount.rows[0].count)===0){
    await pool.query(`
      INSERT INTO products (name,gc_price,stock,image_url,category) VALUES
      ('1 GC Coin',1,999,'https://images.unsplash.com/photo-1610375461368-bdcbb0d6cc81?w=500','gc'),
      ('5 GC Coins',5,999,'https://images.unsplash.com/photo-1620325867502-221cfb5faa5f?w=500','gc'),
      ('10 GC Coins',10,999,'https://images.unsplash.com/photo-1605792657660-596af9009e82?w=500','gc'),
      ('Porsche 911 White',34,10,'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600','cars')
    `);
  }
  console.log("DB initialized");
}
initDB().catch(console.error);

// Health
app.get('/', (req,res)=> res.json({status:'GBC Backend Live', db:'Neon ep-lucky-cloud-aeyrscx9', endpoints:['/api/register','/api/auth/login','/api/products','/api/orders','/api/staff','/api/players','/api/bank_accounts']}));

// REGISTER - from handoff
app.post('/api/register', async (req,res)=>{
  try{
    const {username,email,password} = req.body;
    if(!username||!email||!password) return res.status(400).json({error:'username, email, password required'});
    if(password.length<6) return res.status(400).json({error:'Password min 6 chars'});
    const exists = await pool.query("SELECT id FROM users WHERE username=$1 OR email=$2",[username,email]);
    if(exists.rows.length) return res.status(400).json({error:'Username or email already exists'});
    const hash = await bcrypt.hash(password,10);
    const result = await pool.query("INSERT INTO users (username,email,password_hash,role,display_name) VALUES ($1,$2,$3,'player',$1) RETURNING id,username,email,role",[username,email,hash]);
    const user = result.rows[0];
    await pool.query("INSERT INTO players (user_id,username,display_name,level,gc_balance) VALUES ($1,$2,$2,1,0)",[user.id,username]);
    res.json({id:user.id,username:user.username,email:user.email,role:user.role,message:'Registered'});
  }catch(e){console.error(e);res.status(500).json({error:'Register failed: '+e.message})}
});

// LOGIN - supports username or email (from handoff)
app.post('/api/auth/login', async (req,res)=>{
  try{
    const {username,password} = req.body;
    const identifier = username;
    const result = await pool.query("SELECT * FROM users WHERE username=$1 OR email=$1",[identifier]);
    if(!result.rows.length) return res.status(400).json({error:'User not found'});
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if(!ok) return res.status(400).json({error:'Invalid password'});
    res.json({id:user.id,username:user.username,email:user.email,role:user.role,displayName:user.display_name||user.username});
  }catch(e){console.error(e);res.status(500).json({error:'Login failed'})}
});

// PRODUCTS
app.get('/api/products', async (req,res)=>{
  const r = await pool.query("SELECT * FROM products WHERE active=true ORDER BY gc_price ASC");
  res.json(r.rows);
});
app.post('/api/products', async (req,res)=>{
  const {name,title,gc_price,price,stock,image_url,category,description} = req.body;
  if(!name||(!gc_price&&!price)) return res.status(400).json({error:'name + gc_price required'});
  const p = parseInt(gc_price||price);
  const img = image_url||null;
  const result = await pool.query("INSERT INTO products (name,title,gc_price,price,stock,image_url,category,description,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING *",[name,title||name,p,p,stock||999,img,category||'gc',description||'']);
  res.json(result.rows[0]);
});
app.delete('/api/products/:id', async (req,res)=>{
  await pool.query("UPDATE products SET active=false WHERE id=$1",[req.params.id]);
  res.json({success:true});
});
app.put('/api/products/:id', async (req,res)=>{
  const {name,gc_price,stock,image_url} = req.body;
  await pool.query("UPDATE products SET name=COALESCE($1,name), gc_price=COALESCE($2,gc_price), stock=COALESCE($3,stock), image_url=COALESCE($4,image_url) WHERE id=$5",[name,gc_price,stock,image_url,req.params.id]);
  res.json({success:true});
});

// ORDERS
app.get('/api/orders', async (req,res)=>{
  const r = await pool.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 100");
  res.json(r.rows);
});
app.post('/api/orders', async (req,res)=>{
  try{
    const {rp_name,email,items,total_gc,username} = req.body;
    const total_usd = (Number(total_gc)*0.27).toFixed(2);
    const order_id = 'GBC-'+Date.now()+'-'+Math.random().toString(36).substr(2,5).toUpperCase();
    const transaction_id = order_id;
    const result = await pool.query("INSERT INTO orders (order_id,transaction_id,rp_name,username,email,items,total_gc,total_usd,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending') RETURNING *",[order_id,transaction_id,rp_name||username,username||rp_name,email,JSON.stringify(items||[]),total_gc,total_usd]);
    res.json(result.rows[0]);
  }catch(e){console.error(e);res.status(500).json({error:'Order failed: '+e.message})}
});
app.put('/api/orders/:id', async (req,res)=>{
  const {status} = req.body;
  await pool.query("UPDATE orders SET status=$1 WHERE id=$2",[status,req.params.id]);
  res.json({success:true});
});

// STAFF
app.get('/api/staff', async (req,res)=>{
  const r = await pool.query("SELECT staff.*, users.username, users.email FROM staff JOIN users ON staff.user_id=users.id ORDER BY level DESC");
  res.json(r.rows);
});
app.post('/api/staff', async (req,res)=>{
  const {user_id,level,role} = req.body;
  const r = await pool.query("INSERT INTO staff (user_id,level,role,active) VALUES ($1,$2,$3,true) RETURNING *",[user_id,level||1,role||'support']);
  res.json(r.rows[0]);
});

// PLAYERS
app.get('/api/players', async (req,res)=>{
  const r = await pool.query("SELECT players.*, users.email FROM players JOIN users ON players.user_id=users.id ORDER BY level DESC LIMIT 100");
  res.json(r.rows);
});

// BANK ACCOUNTS
app.get('/api/bank_accounts', async (req,res)=>{
  const r = await pool.query("SELECT * FROM bank_accounts WHERE active=true ORDER BY created_at DESC");
  res.json(r.rows);
});
app.post('/api/bank_accounts', async (req,res)=>{
  const {bank_name,account_number,account_name} = req.body;
  if(!bank_name||!account_number||!account_name) return res.status(400).json({error:'All fields required'});
  const r = await pool.query("INSERT INTO bank_accounts (bank_name,account_number,account_name,active) VALUES ($1,$2,$3,true) RETURNING *",[bank_name,account_number,account_name]);
  res.json(r.rows[0]);
});
app.delete('/api/bank_accounts/:id', async (req,res)=>{
  await pool.query("UPDATE bank_accounts SET active=false WHERE id=$1",[req.params.id]);
  res.json({success:true});
});

// ACCOUNT
app.get('/api/account/:id', async (req,res)=>{
  const u = await pool.query("SELECT id,username,email,role,display_name,created_at FROM users WHERE id=$1",[req.params.id]);
  const p = await pool.query("SELECT * FROM players WHERE user_id=$1",[req.params.id]);
  const o = await pool.query("SELECT * FROM orders WHERE user_id=$1 OR email=(SELECT email FROM users WHERE id=$1) ORDER BY created_at DESC",[req.params.id]);
  res.json({user:u.rows[0],player:p.rows[0],orders:o.rows});
});

const PORT = process.env.PORT||10000;
app.listen(PORT, ()=> console.log('GBC Backend V2 Live on '+PORT));
