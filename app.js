const express = require('express');
const mysql = require('mysql2/promise');
const aws = require('aws-sdk');
const multer = require('multer');
const path = require('path');
const app = express();
const port = 3000;

// Configure AWS S3
aws.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'us-east-1'
});
const s3 = new aws.S3();

// Configure MySQL connection
const dbConfig = {
    host: process.env.RDS_HOSTNAME,
    user: process.env.RDS_USERNAME,
    password: process.env.RDS_PASSWORD,
    database: process.env.RDS_DATABASE
};

// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Create database connection
async function getConnection() {
    return await mysql.createConnection(dbConfig);
}

// Create table if not exists
async function initializeDatabase() {
    const connection = await getConnection();
    await connection.execute(`
        CREATE TABLE IF NOT EXISTS products (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            price DECIMAL(10,2),
            image_url VARCHAR(255)
        )
    `);
    await connection.end();
}

// Initialize database on startup
initializeDatabase();

// Routes
app.get('/products', async (req, res) => {
    try {
        const connection = await getConnection();
        const [rows] = await connection.execute('SELECT * FROM products');
        await connection.end();
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/products', upload.single('image'), async (req, res) => {
    try {
        const { name, description, price } = req.body;
        let imageUrl = null;

        if (req.file) {
            const params = {
                Bucket: process.env.S3_BUCKET,
                Key: `products/${Date.now()}_${req.file.originalname}`,
                Body: req.file.buffer,
                ContentType: req.file.mimetype
            };
            const s3Response = await s3.upload(params).promise();
            imageUrl = s3Response.Location;
        }

        const connection = await getConnection();
        const [result] = await connection.execute(
            'INSERT INTO products (name, description, price, image_url) VALUES (?, ?, ?, ?)',
            [name, description, price, imageUrl]
        );
        await connection.end();
        res.json({ id: result.insertId, name, description, price, imageUrl });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/products/:id', upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, price } = req.body;
        let imageUrl = req.body.currentImage;

        if (req.file) {
            const params = {
                Bucket: process.env.S3_BUCKET,
                Key: `products/${Date.now()}_${req.file.originalname}`,
                Body: req.file.buffer,
                ContentType: req.file.mimetype
            };
            const s3Response = await s3.upload(params).promise();
            imageUrl = s3Response.Location;
        }

        const connection = await getConnection();
        await connection.execute(
            'UPDATE products SET name = ?, description = ?, price = ?, image_url = ? WHERE id = ?',
            [name, description, price, imageUrl, id]
        );
        await connection.end();
        res.json({ id, name, description, price, imageUrl });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const connection = await getConnection();
        await connection.execute('DELETE FROM products WHERE id = ?', [id]);
        await connection.end();
        res.json({ message: 'Product deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});