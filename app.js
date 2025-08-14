const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const AWS = require('aws-sdk');
const path = require('path');
const app = express();
const port = 3000;

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

// Configure PostgreSQL
const pool = new Pool({
  user: process.env.RDS_USER,
  host: process.env.RDS_HOST,
  database: process.env.RDS_DATABASE,
  password: process.env.RDS_PASSWORD,
  port: 5432
});

// Configure Multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Create table if not exists
pool.query(`
  CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    image_url VARCHAR(255)
  )
`).catch(err => console.error('Table creation error:', err));

// Routes
app.get('/items', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/items', upload.single('image'), async (req, res) => {
  try {
    const { name, description } = req.body;
    let imageUrl = null;

    if (req.file) {
      const params = {
        Bucket: process.env.S3_BUCKET,
        Key: `images/${Date.now()}_${req.file.originalname}`,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        ACL: 'public-read'
      };
      const uploadResult = await s3.upload(params).promise();
      imageUrl = uploadResult.Location;
    }

    const result = await pool.query(
      'INSERT INTO items (name, description, image_url) VALUES ($1, $2, $3) RETURNING *',
      [name, description, imageUrl]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/items/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    let imageUrl = null;

    if (req.file) {
      const params = {
        Bucket: process.env.S3_BUCKET,
        Key: `images/${Date.now()}_${req.file.originalname}`,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        ACL: 'public-read'
      };
      const uploadResult = await s3.upload(params).promise();
      imageUrl = uploadResult.Location;
    }

    const result = await pool.query(
      'UPDATE items SET name = $1, description = $2, image_url = COALESCE($3, image_url) WHERE id = $4 RETURNING *',
      [name, description, imageUrl, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM items WHERE id = $1', [id]);
    res.json({ message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
