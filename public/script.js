document.addEventListener('DOMContentLoaded', () => {
    const itemForm = document.getElementById('report-form'); 
    const itemsContainer = document.getElementById('itemsContainer');
    const searchInput = document.getElementById('searchInput');

    const fetchItems = async () => {
        try {
            const response = await fetch('/api/items');
            const items = await response.json();
            renderItems(items);
        } catch (error) {
            console.error('Error fetching items:', error);
        }
    };

    const renderItems = (items) => {
        itemsContainer.innerHTML = '';
        if (!Array.isArray(items)) return;

        items.forEach(item => {
            const itemCard = document.createElement('div');
            // We add a data-category attribute to make filtering easier and more reliable
            itemCard.className = `item-card ${item.status.toLowerCase()}`;
            itemCard.setAttribute('data-category', item.category); 
            
            const imageHtml = item.image_path 
                ? `<img src="${item.image_path}" alt="Item" class="card-image">` 
                : `<div class="no-image">No Image Provided</div>`;

            itemCard.innerHTML = `
                ${imageHtml}
                <div class="card-content">
                    <h3>${item.title} (<span class="card-cat-text">${item.category}</span>)</h3>
                    <div class="info-group">
                        <span class="label">Submitted By:</span>
                        <span class="value">${item.reporter_name}</span>
                    </div>
                    <div class="info-group">
                        <span class="label">Description:</span>
                        <span class="value">${item.description}</span>
                    </div>
                    <div class="info-group">
                        <span class="label">Location:</span>
                        <span class="value">${item.location}</span>
                    </div>
                    <div class="info-group">
                        <span class="label">Date:</span>
                        <span class="value">${new Date(item.item_date).toLocaleDateString()}</span>
                    </div>
                    <div class="info-group">
                        <span class="label">Contact:</span>
                        <span class="value">${item.contact_info}</span>
                    </div>
                    <div class="info-group">
                        <span class="label">Status:</span>
                        <span class="status-tag">${item.status}</span>
                    </div>
                    <div class="actions">
                        ${item.status === 'Active' ? `<button class="resolve-btn" onclick="updateStatus(${item.id})">Mark as Resolved</button>` : ''}
                        <button class="delete-btn" onclick="deleteItem(${item.id})">Delete Report</button>
                    </div>
                </div>
            `;
            itemsContainer.appendChild(itemCard);
        });
        // Run filter once after rendering to respect any existing toggle selection
        filterItems();
    };

    // --- Unified Filtering Logic ---
    const filterItems = () => {
        const searchText = searchInput.value.toLowerCase();
        const activeFilter = document.querySelector('input[name="display-filter"]:checked').value;
        const cards = document.querySelectorAll('.item-card');

        cards.forEach(card => {
            const cardContent = card.textContent.toLowerCase();
            const cardCategory = card.getAttribute('data-category'); // e.g., "Lost" or "Found"

            const matchesSearch = cardContent.includes(searchText);
            const matchesToggle = (activeFilter === 'All' || cardCategory === activeFilter);

            if (matchesSearch && matchesToggle) {
                card.style.display = "";
            } else {
                card.style.display = "none";
            }
        });
    };

    // Event listener for Typing
    searchInput.addEventListener('keyup', filterItems);

    // Event listener for the All/Lost/Found Toggle
    document.querySelectorAll('input[name="display-filter"]').forEach(radio => {
        radio.addEventListener('change', filterItems);
    });

    // --- Existing Submission Logic ---
    itemForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const selectedCategory = document.querySelector('input[name="category"]:checked');
        const imageInput = document.getElementById('item_image');
        const imageFile = imageInput.files[0];

        const formData = new FormData();
        formData.append('reporter_name', document.getElementById('reporter_name').value);
        formData.append('title', document.getElementById('title').value);
        formData.append('category', selectedCategory.value);
        formData.append('description', document.getElementById('description').value);
        formData.append('location', document.getElementById('location').value);
        formData.append('item_date', document.getElementById('item_date').value);
        formData.append('contact_info', document.getElementById('contact_info').value);
        
        if (imageFile) {
            formData.append('item_image', imageFile);
        }

        try {
            const response = await fetch('/api/items', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                alert('Report submitted successfully!');
                itemForm.reset();
                fetchItems();
            } else {
                alert('Submission failed. Check server logs.');
            }
        } catch (err) {
            console.error("Submission error:", err);
        }
    });

    window.updateStatus = async (id) => {
        await fetch(`/api/items/${id}`, { method: 'PATCH' });
        fetchItems();
    };

    window.deleteItem = async (id) => {
        if (!confirm("Delete this report?")) return;
        await fetch(`/api/items/${id}`, { method: 'DELETE' });
        fetchItems();
    };

    fetchItems();
});