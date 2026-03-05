document.addEventListener('DOMContentLoaded', () => {
    const itemForm = document.getElementById('report-form'); 
    const itemsContainer = document.getElementById('itemsContainer');

    if (!itemForm) {
        console.error("Form not found! Check your HTML IDs.");
        return;
    }
    
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
        itemCard.className = `item-card ${item.status.toLowerCase()}`;
        
        itemCard.innerHTML = `
            <h3>${item.title} (${item.category})</h3>
            
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
                ${item.status === 'Active' ? `<button onclick="updateStatus(${item.id})">Mark as Resolved</button>` : ''}
                <button class="delete-btn" onclick="deleteItem(${item.id})">Delete Report</button>
            </div>
        `;
        itemsContainer.appendChild(itemCard);
    });
};

    itemForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const selectedCategory = document.querySelector('input[name="category"]:checked');
        const title = document.getElementById('title').value.trim();
        const contact = document.getElementById('contact_info').value.trim();
        if (title.length < 3) return alert("Title must be at least 3 characters.");
        if (contact.length < 5) return alert("Please provide valid contact info.");
        if (!selectedCategory) {
        alert("Please select Lost or Found!");
        return;
    }

    const formData = {
        title: document.getElementById('title').value,
        category: selectedCategory.value,
        description: document.getElementById('description').value,
        location: document.getElementById('location').value,
        item_date: document.getElementById('item_date').value,
        contact_info: document.getElementById('contact_info').value
    };

       try {
        const response = await fetch('/api/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            alert('Report submitted successfully!');
            itemForm.reset();
            fetchItems();
        } else {
            console.error("Server error:", response.statusText);
        }
    } catch (err) {
        console.error("Network error:", err);
    }
});

    window.updateStatus = async (id) => {
        try {
            await fetch(`/api/items/${id}`, { method: 'PATCH' });
            fetchItems();
        } catch (error) {
            console.error('Update failed');
        }
    };

    window.deleteItem = async (id) => {
        if (!confirm("Are you sure you want to delete this report?")) return;
        try {
            await fetch(`/api/items/${id}`, { method: 'DELETE' });
            fetchItems();
        } catch (error) {
            console.error('Delete failed');
        }
    };

    fetchItems();
});