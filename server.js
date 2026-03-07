const express = require('express');
const db = require('./db');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const app = express();

// ─── Security Middleware ───────────────────────────────────────────────────────

// Helmet: sets secure HTTP headers (XSS protection, content-type sniffing, etc.)
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                fontSrc:    ["'self'", "https://fonts.gstatic.com"],
                imgSrc:     ["'self'", "data:"],
                scriptSrc:  ["'self'"],
            },
        },
    })
);

// Rate Limiter: max 30 requests per 10 minutes per IP (prevents spam/abuse)
const limiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,
    message: { error: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Stricter limiter on POST (submissions): max 10 reports per 10 minutes
const submitLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    message: { error: 'Too many submissions. Please wait before submitting again.' },
});

app.use(limiter);

// ─── Input Sanitization Helper ────────────────────────────────────────────────

// Strips HTML tags only — encoding is handled at render time by the frontend.
const sanitize = (value) => {
    if (typeof value !== 'string') return '';
    return value.replace(/<[^>]*>/g, '').trim();
};

// ─── Admin Credentials ────────────────────────────────────────────────────────
// Store the admin password as a SHA-256 hash — never compare plain-text passwords.
// Hash of "admin42069"
const ADMIN_PASSWORD_HASH = crypto.createHash('sha256').update('admin42069').digest('hex');

// ─── Server-Side Validation Helper ───────────────────────────────────────────

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

    // Verification PIN: exactly 4 digits — used to verify ownership before resolving or deleting
    if (!verification_code || !/^\d{4}$/.test(verification_code.trim()))
        errors.push('Verification PIN must be exactly 4 digits. You will need it to resolve or delete your report.');

    return errors;
};

// ─── File Upload ──────────────────────────────────────────────────────────────

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

// ─── Body Parsing & Static Files ─────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ─── API Routes ───────────────────────────────────────────────────────────────

// GET all items — verification_code is intentionally excluded from response
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

// POST — verify admin password
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required.' });
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    if (hash === ADMIN_PASSWORD_HASH) {
        res.json({ success: true, message: 'Admin access granted.' });
    } else {
        res.status(403).json({ error: 'Incorrect admin password.' });
    }
});

// POST — submit a new report
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
            // Hash the PIN — never store plain-text secrets in the database
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

// PATCH — mark item as resolved
// Admin (admin_password in body) can resolve without PIN; reporters need their PIN.
app.patch('/api/items/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid item ID.' });

        const [[item]] = await db.query('SELECT verification_code, status FROM items WHERE id = ?', [id]);
        if (!item) return res.status(404).json({ error: 'Item not found.' });
        if (item.status === 'Resolved') return res.status(400).json({ error: 'This report is already resolved.' });

        const { admin_password, verification_code } = req.body;

        if (admin_password) {
            // Admin bypass
            const adminHash = crypto.createHash('sha256').update(admin_password).digest('hex');
            if (adminHash !== ADMIN_PASSWORD_HASH)
                return res.status(403).json({ error: 'Incorrect admin password.' });
        } else {
            // Reporter PIN check
            if (!verification_code || !/^\d{4}$/.test(verification_code.trim()))
                return res.status(400).json({ error: 'A valid 4-digit PIN is required to resolve this report.' });
            const inputHash = crypto.createHash('sha256').update(verification_code.trim()).digest('hex');
            if (inputHash !== item.verification_code)
                return res.status(403).json({ error: 'Incorrect PIN. Only the original reporter can resolve this report.' });
        }

        await db.query('UPDATE items SET status = "Resolved" WHERE id = ?', [id]);
        res.json({ message: 'Report marked as resolved.' });
    } catch (err) {
        console.error('[PATCH /api/items/:id]', err);
        res.status(500).json({ error: 'Server error. Please try again.' });
    }
});

// DELETE — remove a report
// Rules:
//   1. Admin (correct admin_password in body) → always allowed, no PIN needed
//   2. Resolved item → no PIN needed (reporter already confirmed ownership via PATCH)
//   3. Active item → correct 4-digit reporter PIN required
app.delete('/api/items/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid item ID.' });

        const [[item]] = await db.query('SELECT verification_code, image_path, status FROM items WHERE id = ?', [id]);
        if (!item) return res.status(404).json({ error: 'Item not found.' });

        const { admin_password, verification_code } = req.body;

        // ── Rule 1: Admin bypass ──────────────────────────────────────────────
        if (admin_password) {
            const adminHash = crypto.createHash('sha256').update(admin_password).digest('hex');
            if (adminHash !== ADMIN_PASSWORD_HASH)
                return res.status(403).json({ error: 'Incorrect admin password.' });
            // Admin verified — fall through to deletion
        }
        // ── Rule 2: Already resolved — no PIN needed ─────────────────────────
        else if (item.status === 'Resolved') {
            // Fall through to deletion
        }
        // ── Rule 3: Active — require reporter PIN ────────────────────────────
        else {
            if (!verification_code || !/^\d{4}$/.test(verification_code.trim()))
                return res.status(400).json({ error: 'A valid 4-digit PIN is required to delete this report.' });
            const inputHash = crypto.createHash('sha256').update(verification_code.trim()).digest('hex');
            if (inputHash !== item.verification_code)
                return res.status(403).json({ error: 'Incorrect PIN. Only the original reporter can delete this report.' });
        }

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

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('[Global Error]', err.message);
    res.status(err.status || 500).json({ error: err.message || 'An unexpected error occurred.' });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));