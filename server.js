const express = require('express');
const db = require('./db');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/api/items', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM items ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
});

app.post('/api/items', async (req, res) => {
    const { title, description, category, location, item_date, contact_info } = req.body;

    if (!title || !description || !contact_info) {
        return res.status(400).json({ error: "Required fields missing" });
    }

    try {
        const query = 'INSERT INTO items (title, description, category, location, item_date, contact_info) VALUES (?, ?, ?, ?, ?, ?)';
        await db.query(query, [title, description, category, location, item_date, contact_info]);
        res.status(201).json({ message: "Report submitted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

app.patch('/api/items/:id', async (req, res) => {
    try {
        await db.query('UPDATE items SET status = "Resolved" WHERE id = ?', [req.params.id]);
        res.json({ message: "Status updated" });
    } catch (err) {
        res.status(500).json({ error: "Update failed" });
    }
});

app.delete('/api/items/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM items WHERE id = ?', [req.params.id]);
        res.json({ message: "Report deleted" });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});

app.use((req, res) => res.status(404).send("Resource Not Found"));

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));