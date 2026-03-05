const express = require('express');
const db = require('./db');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const app = express();

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/api/items', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM items ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Server Error!" });
    }
});

app.post('/api/items', upload.single('item_image'), async (req, res) => {
    try {
        const { reporter_name, title, description, category, location, item_date, contact_info } = req.body;
        const image_path = req.file ? `/uploads/${req.file.filename}` : null;

        if (!reporter_name || !title || !description) {
            return res.status(400).json({ error: "Missing fields" });
        }

        const query = 'INSERT INTO items (reporter_name, title, description, category, location, item_date, contact_info, image_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        await db.query(query, [reporter_name, title, description, category, location, item_date, contact_info, image_path]);
        
        res.status(201).json({ message: "Success" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

app.patch('/api/items/:id', async (req, res) => {
    await db.query('UPDATE items SET status = "Resolved" WHERE id = ?', [req.params.id]);
    res.json({ message: "Updated" });
});

app.delete('/api/items/:id', async (req, res) => {
    await db.query('DELETE FROM items WHERE id = ?', [req.params.id]);
    res.json({ message: "Deleted" });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));