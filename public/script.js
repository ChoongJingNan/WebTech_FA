document.addEventListener('DOMContentLoaded', () => {
    const itemForm        = document.getElementById('report-form');
    const itemsContainer  = document.getElementById('itemsContainer');
    const searchInput     = document.getElementById('searchInput');
    const formErrorBox    = document.getElementById('form-error-box');
    const pinModal        = document.getElementById('pin-modal');
    const modalPinInput   = document.getElementById('modal-pin-input');
    const modalPinError   = document.getElementById('modal-pin-error');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    const modalCancelBtn  = document.getElementById('modal-cancel-btn');
    const modalDescription = document.getElementById('modal-description');

    let pendingAction = null;

    const openModal = (type, id) => {
        pendingAction = { type, id };
        modalDescription.textContent = type === 'resolve'
            ? 'Enter your 4-digit PIN to mark this report as resolved.'
            : 'Enter your 4-digit PIN to permanently delete this report.';
        modalPinInput.value = '';
        modalPinError.textContent = '';
        pinModal.style.display = 'flex';
        modalPinInput.focus();
    };

    const closeModal = () => {
        pendingAction = null;
        pinModal.style.display = 'none';
        modalPinInput.value = '';
        modalPinError.textContent = '';
    };

    modalCancelBtn.addEventListener('click', closeModal);
    pinModal.addEventListener('click', (e) => { if (e.target === pinModal) closeModal(); });

    modalConfirmBtn.addEventListener('click', async () => {
        const pin = modalPinInput.value.trim();
        if (!/^\d{4}$/.test(pin)) {
            modalPinError.textContent = 'Please enter exactly 4 digits.';
            return;
        }
        modalPinError.textContent = '';
        modalConfirmBtn.disabled = true;
        modalConfirmBtn.textContent = 'Processing...';

        const { type, id } = pendingAction;
        try {
            const method = type === 'resolve' ? 'PATCH' : 'DELETE';
            const res = await fetch(`/api/items/${id}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ verification_code: pin }),
            });
            const data = await res.json();
            if (res.ok) {
                closeModal();
                fetchItems();
            } else {
                modalPinError.textContent = data.error || 'Something went wrong.';
            }
        } catch {
            modalPinError.textContent = 'Network error. Please try again.';
        } finally {
            modalConfirmBtn.disabled = false;
            modalConfirmBtn.textContent = 'Confirm';
        }
    });

    modalPinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') modalConfirmBtn.click();
    });

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
            const itemCard = document.createElement('div');
            itemCard.className = `item-card ${item.status.toLowerCase()}`;
            itemCard.setAttribute('data-category', item.category);

            const imageHtml = item.image_path
                ? `<img src="${escapeHtml(item.image_path)}" alt="Item image" class="card-image" loading="lazy">`
                : `<div class="no-image">No Image Provided</div>`;

            itemCard.innerHTML = `
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
                  ${item.status === 'Active'
                     ? `<button class="resolve-btn" data-id="${item.id}">Mark as Resolved</button>`
                       : ''}
                   <button class="delete-btn" data-id="${item.id}">Delete Report</button>
</div>
            `;
            itemsContainer.appendChild(itemCard);
        });
        filterItems();
    };

    const filterItems = () => {
        const searchText   = searchInput.value.toLowerCase();
        const activeFilter = document.querySelector('input[name="display-filter"]:checked').value;
        document.querySelectorAll('.item-card').forEach(card => {
            const matchesSearch  = card.textContent.toLowerCase().includes(searchText);
            const matchesToggle  = (activeFilter === 'All' || card.getAttribute('data-category') === activeFilter);
            card.style.display   = (matchesSearch && matchesToggle) ? '' : 'none';
        });
    };

    itemsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = parseInt(btn.dataset.id, 10);
    if (isNaN(id)) return;
    if (btn.classList.contains('resolve-btn')) openModal('resolve', id);
    if (btn.classList.contains('delete-btn')) openModal('delete', id);
});

    searchInput.addEventListener('keyup', filterItems);
    document.querySelectorAll('input[name="display-filter"]').forEach(r => r.addEventListener('change', filterItems));

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

        if (reporter_name.length < 2) {
            showFieldError('reporter_name', 'Name must be at least 2 characters.'); valid = false;
        }
        if (contact_info.length < 5) {
            showFieldError('contact_info', 'Contact info must be at least 5 characters.'); valid = false;
        }
        if (title.length < 2) {
            showFieldError('title', 'Item name must be at least 2 characters.'); valid = false;
        }
        if (description.length < 10) {
            showFieldError('description', 'Description must be at least 10 characters.'); valid = false;
        }
        if (location.length < 2) {
            showFieldError('location', 'Location must be at least 2 characters.'); valid = false;
        }
        if (!item_date) {
            showFieldError('item_date', 'Please select a date.'); valid = false;
        } else if (new Date(item_date) > new Date()) {
            showFieldError('item_date', 'Date cannot be in the future.'); valid = false;
        }
        if (!/^\d{4}$/.test(verification_code)) {
            showFieldError('verification_code', 'PIN must be exactly 4 digits.'); valid = false;
        }
        if (imageFile) {
            const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!allowed.includes(imageFile.type)) {
                showFieldError('item_image', 'Only JPEG, PNG, GIF, or WEBP files are allowed.'); valid = false;
            }
            if (imageFile.size > 5 * 1024 * 1024) {
                showFieldError('item_image', 'Image must be under 5 MB.'); valid = false;
            }
        }

        return valid;
    };

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
                alert('Report submitted successfully! Remember your PIN to resolve or delete it later.');
                itemForm.reset();
                fetchItems();
            } else if (data.errors) {
                formErrorBox.innerHTML = '<strong>Please fix the following:</strong><ul>' +
                    data.errors.map(e => `<li>${e}</li>`).join('') + '</ul>';
                formErrorBox.style.display = 'block';
            } else {
                alert(data.error || 'Submission failed. Check server logs.');
            }
        } catch (err) {
            console.error('Submission error:', err);
            alert('Network error. Please try again.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Report';
        }
    });
    fetchItems();
});
