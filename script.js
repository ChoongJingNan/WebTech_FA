document.addEventListener('DOMContentLoaded', () => {
    const itemForm = document.getElementById('itemForm');
    const itemsContainer = document.getElementById('itemsContainer');

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
        items.forEach(item => {
            const itemCard = document.createElement('div');
            itemCard.className = `item-card ${item.status.toLowerCase()}`;

            itemCard.innerHTML = `
                <h3>${item.title} (${item.category})</h3>
                <p><strong>Description:</strong> ${item.description}</p>
                <p><strong>Location:</strong> ${item.location}</p>
                <p><strong>Date:</strong> ${new Date(item.item_date).toLocaleDateString()}</p>
                <p><strong>Contact:</strong> ${item.contact_info}</p>
                <p><strong>Status:</strong> <span class="status-tag">${item.status}</span></p>
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

        const title = document.getElementById('title').value.trim();
        const contact = document.getElementById('contact_info').value.trim();
        if (title.length < 3) return alert("Title must be at least 3 characters.");
        if (contact.length < 5) return alert("Please provide valid contact info.");

        const formData = {
            title: title,
            description: document.getElementById('description').value,
            category: document.getElementById('category').value,
            location: document.getElementById('location').value,
            item_date: document.getElementById('item_date').value,
            contact_info: contact
        };

        try {
            const response = await fetch('/api/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                itemForm.reset();
                fetchItems();
            }
        } catch (error) {
            alert("Failed to submit report.");
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