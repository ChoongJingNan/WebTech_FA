document.addEventListener('DOMContentLoaded', () => {

    // ─── State ────────────────────────────────────────────────────────────────
    let isAdmin = false;

    // ─── Element References ───────────────────────────────────────────────────
    const itemForm          = document.getElementById('report-form');
    const itemsContainer    = document.getElementById('itemsContainer');
    const searchInput       = document.getElementById('searchInput');
    const formErrorBox      = document.getElementById('form-error-box');

    // Role selection
    const roleOverlay        = document.getElementById('role-overlay');
    const btnUser            = document.getElementById('btn-user');
    const btnAdmin           = document.getElementById('btn-admin');
    const adminBadge         = document.getElementById('admin-badge');
    const userBadge          = document.getElementById('user-badge');
    const logoutBtn          = document.getElementById('logout-btn');
    const userLogoutBtn      = document.getElementById('user-logout-btn');

    // Admin login modal
    const adminLoginModal   = document.getElementById('admin-login-modal');
    const adminPasswordInput = document.getElementById('admin-password-input');
    const adminLoginConfirm = document.getElementById('admin-login-confirm');
    const adminLoginCancel  = document.getElementById('admin-login-cancel');
    const adminLoginError   = document.getElementById('admin-login-error');

    // PIN modal
    const pinModal          = document.getElementById('pin-modal');
    const modalPinInput     = document.getElementById('modal-pin-input');
    const modalPinError     = document.getElementById('modal-pin-error');
    const modalConfirmBtn   = document.getElementById('modal-confirm-btn');
    const modalCancelBtn    = document.getElementById('modal-cancel-btn');
    const modalDescription  = document.getElementById('modal-description');

    let pendingAction = null; // { type: 'resolve'|'delete', id, status }

    // ─── Role Selection ───────────────────────────────────────────────────────
    btnUser.addEventListener('click', () => {
        isAdmin = false;
        roleOverlay.style.display = 'none';
        adminBadge.style.display = 'none';
        userBadge.style.display = 'flex';
    });

    btnAdmin.addEventListener('click', () => {
        roleOverlay.style.display = 'none';
        openAdminLoginModal();
    });

    // ─── Admin Login Modal ────────────────────────────────────────────────────
    const openAdminLoginModal = () => {
        adminPasswordInput.value = '';
        adminLoginError.textContent = '';
        adminLoginModal.style.display = 'flex';
        adminPasswordInput.focus();
    };

    const closeAdminLoginModal = () => {
        adminLoginModal.style.display = 'none';
        adminPasswordInput.value = '';
        adminLoginError.textContent = '';
    };

    adminLoginCancel.addEventListener('click', () => {
        closeAdminLoginModal();
        // Return to role selection if user cancels admin login
        roleOverlay.style.display = 'flex';
    });

    adminLoginConfirm.addEventListener('click', async () => {
        const password = adminPasswordInput.value;
        if (!password) { adminLoginError.textContent = 'Please enter the admin password.'; return; }

        adminLoginConfirm.disabled = true;
        adminLoginConfirm.textContent = 'Verifying...';

        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            const data = await res.json();
            if (res.ok) {
                isAdmin = true;
                closeAdminLoginModal();
                userBadge.style.display = 'none';
                adminBadge.style.display = 'flex';
            } else {
                adminLoginError.textContent = data.error || 'Login failed.';
            }
        } catch {
            adminLoginError.textContent = 'Network error. Please try again.';
        } finally {
            adminLoginConfirm.disabled = false;
            adminLoginConfirm.textContent = 'Login';
        }
    });

    adminPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') adminLoginConfirm.click();
    });

    // Admin logout — return to role selection
    logoutBtn.addEventListener('click', () => {
        isAdmin = false;
        adminBadge.style.display = 'none';
        userBadge.style.display = 'none';
        roleOverlay.style.display = 'flex';
    });

    // User logout — return to role selection
    userLogoutBtn.addEventListener('click', () => {
        isAdmin = false;
        userBadge.style.display = 'none';
        adminBadge.style.display = 'none';
        roleOverlay.style.display = 'flex';
    });

    // ─── PIN Modal ────────────────────────────────────────────────────────────
    const openPinModal = (type, id) => {
        pendingAction = { type, id };
        modalDescription.textContent = type === 'resolve'
            ? 'Enter your 4-digit PIN to mark this report as resolved.'
            : 'Enter your 4-digit PIN to delete this report.';
        modalPinInput.value = '';
        modalPinError.textContent = '';
        pinModal.style.display = 'flex';
        modalPinInput.focus();
    };

    const closePinModal = () => {
        pendingAction = null;
        pinModal.style.display = 'none';
        modalPinInput.value = '';
        modalPinError.textContent = '';
    };

    modalCancelBtn.addEventListener('click', closePinModal);
    pinModal.addEventListener('click', (e) => { if (e.target === pinModal) closePinModal(); });

    modalConfirmBtn.addEventListener('click', async () => {
        const pin = modalPinInput.value.trim();
        if (!/^\d{4}$/.test(pin)) { modalPinError.textContent = 'Please enter exactly 4 digits.'; return; }
        modalPinError.textContent = '';
        modalConfirmBtn.disabled = true;
        modalConfirmBtn.textContent = 'Processing...';

        const { type, id } = pendingAction;
        const method = type === 'resolve' ? 'PATCH' : 'DELETE';
        try {
            const res = await fetch(`/api/items/${id}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ verification_code: pin }),
            });
            const data = await res.json();
            if (res.ok) { closePinModal(); fetchItems(); }
            else { modalPinError.textContent = data.error || 'Something went wrong.'; }
        } catch {
            modalPinError.textContent = 'Network error. Please try again.';
        } finally {
            modalConfirmBtn.disabled = false;
            modalConfirmBtn.textContent = 'Confirm';
        }
    });

    modalPinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') modalConfirmBtn.click(); });

    // ─── Smart Delete / Resolve Logic ─────────────────────────────────────────
    /**
     * Delete logic:
     *   - Admin        → send admin_password directly, no modal
     *   - Resolved item → send request with no credentials, server allows it
     *   - Active item  → open PIN modal
     */
    const handleDelete = async (id, status) => {
        if (isAdmin) {
            // Admin: send admin_password in request body, no modal needed
            if (!confirm('Delete this report as admin?')) return;
            try {
                const res = await fetch(`/api/items/${id}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ admin_password: 'admin42069' }),
                });
                const data = await res.json();
                if (res.ok) fetchItems();
                else alert(data.error || 'Delete failed.');
            } catch { alert('Network error. Please try again.'); }
        } else if (status === 'Resolved') {
            // Resolved items: no PIN needed
            if (!confirm('Delete this resolved report?')) return;
            try {
                const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
                const data = await res.json();
                if (res.ok) fetchItems();
                else alert(data.error || 'Delete failed.');
            } catch { alert('Network error. Please try again.'); }
        } else {
            // Active items: require reporter PIN
            openPinModal('delete', id);
        }
    };

    const handleResolve = (id) => {
        if (isAdmin) {
            // Admin can also resolve without PIN using admin_password
            openAdminResolveConfirm(id);
        } else {
            openPinModal('resolve', id);
        }
    };

    // Admin resolve — sends admin_password to PATCH (we'll add support on server for this)
    const openAdminResolveConfirm = async (id) => {
        if (!confirm('Mark this report as resolved as admin?')) return;
        try {
            const res = await fetch(`/api/items/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ admin_password: 'admin42069' }),
            });
            const data = await res.json();
            if (res.ok) fetchItems();
            else alert(data.error || 'Could not resolve.');
        } catch { alert('Network error. Please try again.'); }
    };

    // ─── Fetch & Render Items ─────────────────────────────────────────────────
    const fetchItems = async () => {
        try {
            const response = await fetch('/api/items');
            const items = await response.json();
            renderItems(Array.isArray(items) ? items : []);
        } catch (error) {
            console.error('Error fetching items:', error);
        }
    };

    const escapeHtml = (str) => {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    };

    const renderItems = (items) => {
        itemsContainer.innerHTML = '';
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = `item-card ${item.status.toLowerCase()}`;
            card.setAttribute('data-category', item.category);
            card.setAttribute('data-id', item.id);
            card.setAttribute('data-status', item.status);

            const imageHtml = item.image_path
                ? `<img src="${escapeHtml(item.image_path)}" alt="Item image" class="card-image" loading="lazy">`
                : `<div class="no-image">No Image Provided</div>`;

            const resolveBtn = item.status === 'Active'
                ? `<button class="resolve-btn action-resolve">Mark as Resolved</button>`
                : '';

            // Show "No PIN needed" hint on resolved cards for non-admin users
            const deleteHint = (!isAdmin && item.status === 'Resolved')
                ? `<span class="no-pin-hint">✓ No PIN needed</span>`
                : '';

            card.innerHTML = `
                ${imageHtml}
                <div class="card-content">
                    <h3>${escapeHtml(item.title)} (<span class="card-cat-text">${escapeHtml(item.category)}</span>)</h3>
                    <div class="info-group">
                        <span class="label">Submitted By:</span>
                        <span class="value">${escapeHtml(item.reporter_name)}</span>
                    </div>
                    <div class="info-group">
                        <span class="label">Description:</span>
                        <span class="value">${escapeHtml(item.description)}</span>
                    </div>
                    <div class="info-group">
                        <span class="label">Location:</span>
                        <span class="value">${escapeHtml(item.location)}</span>
                    </div>
                    <div class="info-group">
                        <span class="label">Date:</span>
                        <span class="value">${new Date(item.item_date).toLocaleDateString()}</span>
                    </div>
                    <div class="info-group">
                        <span class="label">Contact:</span>
                        <span class="value">${escapeHtml(item.contact_info)}</span>
                    </div>
                    <div class="info-group">
                        <span class="label">Status:</span>
                        <span class="status-tag">${escapeHtml(item.status)}</span>
                    </div>
                    <div class="actions">
                        ${resolveBtn}
                        ${deleteHint}
                        <button class="delete-btn action-delete">Delete Report</button>
                    </div>
                </div>
            `;
            itemsContainer.appendChild(card);
        });
        filterItems();
    };

    // ─── Event Delegation for Card Buttons ────────────────────────────────────
    itemsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const card = btn.closest('.item-card');
        if (!card) return;
        const id     = parseInt(card.dataset.id, 10);
        const status = card.dataset.status;
        if (isNaN(id)) return;

        if (btn.classList.contains('action-resolve')) handleResolve(id);
        if (btn.classList.contains('action-delete'))  handleDelete(id, status);
    });

    // ─── Filtering ────────────────────────────────────────────────────────────
    const filterItems = () => {
        const searchText   = searchInput.value.toLowerCase();
        const activeFilter = document.querySelector('input[name="display-filter"]:checked').value;
        document.querySelectorAll('.item-card').forEach(card => {
            const matchesSearch = card.textContent.toLowerCase().includes(searchText);
            const matchesToggle = (activeFilter === 'All' || card.getAttribute('data-category') === activeFilter);
            card.style.display  = (matchesSearch && matchesToggle) ? '' : 'none';
        });
    };

    searchInput.addEventListener('keyup', filterItems);
    document.querySelectorAll('input[name="display-filter"]').forEach(r => r.addEventListener('change', filterItems));

    // ─── Frontend Validation ──────────────────────────────────────────────────
    const clearErrors = () => {
        document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
        formErrorBox.style.display = 'none';
        formErrorBox.innerHTML = '';
    };

    const showFieldError = (fieldId, message) => {
        const el = document.getElementById(`err-${fieldId}`);
        if (el) el.textContent = message;
    };

    const validateForm = () => {
        clearErrors();
        let valid = true;
        const reporter_name     = document.getElementById('reporter_name').value.trim();
        const contact_info      = document.getElementById('contact_info').value.trim();
        const title             = document.getElementById('title').value.trim();
        const description       = document.getElementById('description').value.trim();
        const location          = document.getElementById('location').value.trim();
        const item_date         = document.getElementById('item_date').value;
        const verification_code = document.getElementById('verification_code').value.trim();
        const imageFile         = document.getElementById('item_image').files[0];

        if (reporter_name.length < 2)  { showFieldError('reporter_name', 'Name must be at least 2 characters.'); valid = false; }
        if (contact_info.length < 5)   { showFieldError('contact_info', 'Contact info must be at least 5 characters.'); valid = false; }
        if (title.length < 2)          { showFieldError('title', 'Item name must be at least 2 characters.'); valid = false; }
        if (description.length < 10)   { showFieldError('description', 'Description must be at least 10 characters.'); valid = false; }
        if (location.length < 2)       { showFieldError('location', 'Location must be at least 2 characters.'); valid = false; }
        if (!item_date)                { showFieldError('item_date', 'Please select a date.'); valid = false; }
        else if (new Date(item_date) > new Date()) { showFieldError('item_date', 'Date cannot be in the future.'); valid = false; }
        if (!/^\d{4}$/.test(verification_code)) { showFieldError('verification_code', 'PIN must be exactly 4 digits.'); valid = false; }
        if (imageFile) {
            if (!['image/jpeg','image/png','image/gif','image/webp'].includes(imageFile.type))
                { showFieldError('item_image', 'Only JPEG, PNG, GIF, or WEBP files are allowed.'); valid = false; }
            if (imageFile.size > 5 * 1024 * 1024)
                { showFieldError('item_image', 'Image must be under 5 MB.'); valid = false; }
        }
        return valid;
    };

    // ─── Form Submission ──────────────────────────────────────────────────────
    itemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        const formData = new FormData();
        formData.append('reporter_name',     document.getElementById('reporter_name').value.trim());
        formData.append('title',             document.getElementById('title').value.trim());
        formData.append('category',          document.querySelector('input[name="category"]:checked').value);
        formData.append('description',       document.getElementById('description').value.trim());
        formData.append('location',          document.getElementById('location').value.trim());
        formData.append('item_date',         document.getElementById('item_date').value);
        formData.append('contact_info',      document.getElementById('contact_info').value.trim());
        formData.append('verification_code', document.getElementById('verification_code').value.trim());
        const imageFile = document.getElementById('item_image').files[0];
        if (imageFile) formData.append('item_image', imageFile);

        const submitBtn = itemForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        try {
            const response = await fetch('/api/items', { method: 'POST', body: formData });
            const data = await response.json();
            if (response.ok) {
                alert('Report submitted! Remember your PIN to manage it later.');
                itemForm.reset();
                fetchItems();
            } else if (data.errors) {
                formErrorBox.innerHTML = '<strong>Please fix the following:</strong><ul>' +
                    data.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('') + '</ul>';
                formErrorBox.style.display = 'block';
            } else {
                alert(data.error || 'Submission failed.');
            }
        } catch { alert('Network error. Please try again.'); }
        finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Report';
        }
    });

    fetchItems();
});