const express = require('express');
const db = require('./db');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const app = express();
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                fontSrc:    ["'self'", "https://fonts.gstatic.com"],
                imgSrc:     ["'self'", "data:"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
            },
        },
    })
);

const limiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,
    message: { error: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const submitLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    message: { error: 'Too many submissions. Please wait before submitting again.' },
});

app.use(limiter);

const sanitize = (value) => {
    if (typeof value !== 'string') return '';
    return value.replace(/<[^>]*>/g, '').trim();
};

const validateReportFields = ({ reporter_name, title, description, category, location, item_date, contact_info, verification_code }) => {
    const errors = [];

    if (!reporter_name || reporter_name.trim().length < 2)
        errors.push('Reporter name must be at least 2 characters.');
    if (reporter_name && reporter_name.trim().length > 100)
        errors.push('Reporter name must be under 100 characters.');

    if (!title || title.trim().length < 2)
        errors.push('Item title must be at least 2 characters.');
    if (title && title.trim().length > 255)
        errors.push('Item title must be under 255 characters.');

    if (!description || description.trim().length < 10)
        errors.push('Description must be at least 10 characters.');
    if (description && description.trim().length > 1000)
        errors.push('Description must be under 1000 characters.');

    if (!['Lost', 'Found'].includes(category))
        errors.push('Category must be either Lost or Found.');

    if (!location || location.trim().length < 2)
        errors.push('Location must be at least 2 characters.');
    if (location && location.trim().length > 255)
        errors.push('Location must be under 255 characters.');

    if (!item_date)
        errors.push('Date is required.');
    else {
        const parsed = new Date(item_date);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (isNaN(parsed.getTime()))
            errors.push('Date is not valid.');
        else if (parsed > today)
            errors.push('Date cannot be in the future.');
    }

    if (!contact_info || contact_info.trim().length < 5)
        errors.push('Contact info must be at least 5 characters.');
    if (contact_info && contact_info.trim().length > 255)
        errors.push('Contact info must be under 255 characters.');
    if (!verification_code || !/^\d{4}$/.test(verification_code.trim()))
        errors.push('Verification PIN must be exactly 4 digits. You will need it to resolve or delete your report.');

    return errors;
};

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    },
});

const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (allowedMimeTypes.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only JPEG, PNG, GIF, or WEBP images are allowed.'));
    },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/api/items', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, reporter_name, title, description, category, location, item_date, contact_info, image_path, status, created_at FROM items ORDER BY created_at DESC'
        );
        res.json(rows);
    } catch (err) {
        console.error('[GET /api/items]', err);
        res.status(500).json({ error: 'Server error. Please try again.' });
    }
});

app.post('/api/items', submitLimiter, upload.single('item_image'), async (req, res) => {
    try {
        const { reporter_name, title, description, category, location, item_date, contact_info, verification_code } = req.body;

        const errors = validateReportFields({ reporter_name, title, description, category, location, item_date, contact_info, verification_code });
        if (errors.length > 0) {
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(400).json({ errors });
        }

        const clean = {
            reporter_name: sanitize(reporter_name),
            title:         sanitize(title),
            description:   sanitize(description),
            category,
            location:      sanitize(location),
            item_date,
            contact_info:  sanitize(contact_info),
            image_path:    req.file ? `/uploads/${req.file.filename}` : null,
            verification_code: crypto.createHash('sha256').update(verification_code.trim()).digest('hex'),
        };

        const query = `INSERT INTO items (reporter_name, title, description, category, location, item_date, contact_info, image_path, verification_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        await db.query(query, [
            clean.reporter_name, clean.title, clean.description, clean.category,
            clean.location, clean.item_date, clean.contact_info,
            clean.image_path, clean.verification_code,
        ]);

        res.status(201).json({ message: 'Report submitted successfully.' });
    } catch (err) {
        if (req.file) fs.unlink(req.file.path, () => {});
        console.error('[POST /api/items]', err);
        res.status(500).json({ error: 'Database error. Please try again.' });
    }
});

app.patch('/api/items/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid item ID.' });

        const { verification_code } = req.body;
        if (!verification_code || !/^\d{4}$/.test(verification_code.trim()))
            return res.status(400).json({ error: 'A valid 4-digit PIN is required to resolve this report.' });

        const [[item]] = await db.query('SELECT verification_code, status FROM items WHERE id = ?', [id]);
        if (!item) return res.status(404).json({ error: 'Item not found.' });
        if (item.status === 'Resolved') return res.status(400).json({ error: 'This report is already resolved.' });

        const inputHash = crypto.createHash('sha256').update(verification_code.trim()).digest('hex');
        if (inputHash !== item.verification_code)
            return res.status(403).json({ error: 'Incorrect PIN. Only the original reporter can resolve this report.' });

        await db.query('UPDATE items SET status = "Resolved" WHERE id = ?', [id]);
        res.json({ message: 'Report marked as resolved.' });
    } catch (err) {
        console.error('[PATCH /api/items/:id]', err);
        res.status(500).json({ error: 'Server error. Please try again.' });
    }
});

app.delete('/api/items/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid item ID.' });

        const { verification_code } = req.body;
        if (!verification_code || !/^\d{4}$/.test(verification_code.trim()))
            return res.status(400).json({ error: 'A valid 4-digit PIN is required to delete this report.' });

        const [[item]] = await db.query('SELECT verification_code, image_path FROM items WHERE id = ?', [id]);
        if (!item) return res.status(404).json({ error: 'Item not found.' });

        const inputHash = crypto.createHash('sha256').update(verification_code.trim()).digest('hex');
        if (inputHash !== item.verification_code)
            return res.status(403).json({ error: 'Incorrect PIN. Only the original reporter can delete this report.' });

        if (item.image_path) {
            const imgPath = path.join(__dirname, 'public', item.image_path);
            fs.unlink(imgPath, () => {});
        }

        await db.query('DELETE FROM items WHERE id = ?', [id]);
        res.json({ message: 'Report deleted.' });
    } catch (err) {
        console.error('[DELETE /api/items/:id]', err);
        res.status(500).json({ error: 'Server error. Please try again.' });
    }
});

app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

app.use((err, req, res, next) => {
    console.error('[Global Error]', err.message);
    res.status(err.status || 500).json({ error: err.message || 'An unexpected error occurred.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));