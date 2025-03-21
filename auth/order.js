const express = require('express');
const { supabase } = require('../supabaseClient'); // Import Supabase client
const router = express.Router();

// Helper Function: Check if User is a Superuser
const isSuperUser = async (user_id) => {
    try {
        const { data: superuser, error } = await supabase
            .from('superusers') // Reference the superusers table
            .select('id')
            .eq('id', user_id)
            .single();

        if (error || !superuser) {
            console.error('Superuser Check Failed:', error?.message || 'Superuser not found');
            return false;
        }

        console.log(`Superuser verified: ${user_id}`);
        return true;
    } catch (err) {
        console.error('Unexpected error while checking superuser:', err.message);
        return false;
    }
};

///------------------ Orders Endpoints ------------------///

// Place a New Order (Generate Order)
router.post('/', async (req, res) => {
    const { user_id, items } = req.body;

    // Validate input
    if (!user_id || !items || items.length === 0) {
        return res.status(400).json({ error: 'User ID and at least one item are required to create an order.' });
    }

    try {
        // Create a new order
        const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .insert([{ user_id, order_status: 'Pending', created_at: new Date().toISOString() }])
            .select()
            .single(); // Retrieve the created order

        if (orderError) {
            console.error('Error creating order:', orderError.message);
            return res.status(500).json({ error: 'Failed to create the order.' });
        }

        const orderId = orderData.id;

        // Add items to the order
        const formattedItems = [];
        for (const item of items) {
            // Validate each item
            if (!item.product_id || !item.quantity || item.quantity <= 0) {
                return res.status(400).json({ error: 'Each item must have a valid product_id and quantity.' });
            }

            // Fetch product details to ensure the product exists
            const { data: productData, error: productError } = await supabase
                .from('products')
                .select(`id, title`)
                .eq('id', item.product_id)
                .single();

            if (productError || !productData) {
                console.error(`Error fetching product with ID ${item.product_id}:`, productError?.message);
                return res.status(404).json({ error: `Product with ID ${item.product_id} not found.` });
            }

            // Check size validity if size_id is provided
            if (item.size_id) {
                const { data: sizeData, error: sizeError } = await supabase
                    .from('product_sizes')
                    .select(`size_id`)
                    .eq('product_id', item.product_id)
                    .eq('size_id', item.size_id)
                    .single();

                if (sizeError || !sizeData) {
                    return res.status(400).json({
                        error: `Invalid size ID ${item.size_id} for product ${item.product_id}.`,
                    });
                }
            }

            // Add the formatted item to the list
            formattedItems.push({
                order_id: orderId,
                product_id: item.product_id,
                size_id: item.size_id || null, // Add size_id only if provided
                quantity: item.quantity,
            });
        }

        // Insert items into the `orderitems` table
        const { data: itemsData, error: itemsError } = await supabase
            .from('orderitems')
            .insert(formattedItems)
            .select(); // Retrieve inserted items for the response

        if (itemsError) {
            console.error('Error adding items to order:', itemsError.message);
            return res.status(500).json({ error: 'Failed to add items to the order.' });
        }

        // Respond with success
        res.status(201).json({
            message: 'Order created successfully!',
            order: orderData,
            items: itemsData, // Return both order and items
        });
    } catch (err) {
        console.error('Unexpected error:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Update Order Status
router.put('/status', async (req, res) => {
    const { order_id, status } = req.body; // Extract order_id and status from the body

    // Validate the input
    if (!order_id) {
        return res.status(400).json({ error: 'Order ID is required.' });
    }
    if (!status) {
        return res.status(400).json({ error: 'Order status is required.' });
    }

    try {
        // Update the order status
        const { data: updatedOrder, error } = await supabase
            .from('orders')
            .update({ order_status: status })
            .eq('id', order_id)
            .select()
            .single(); // Retrieve the updated order

        if (error) {
            console.error('Error updating order status:', error.message);
            return res.status(500).json({ error: 'Failed to update order status.' });
        }

        if (!updatedOrder) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        res.status(200).json({
            message: `Order status updated to '${status}' successfully!`,
            order: updatedOrder,
        });
    } catch (err) {
        console.error('Unexpected error updating order status:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});


// Fetch All Orders for a Specific User
router.post('/user/orders', async (req, res) => {
    const { user_id } = req.body; // Extract user_id from the request body

    // Validate input
    if (!user_id) {
        return res.status(400).json({ error: 'User ID is required.' });
    }

    try {
        // Fetch orders for the user
        const { data, error } = await supabase
            .from('orders')
            .select('*, orderitems(product_id, quantity, size_id)') // Include associated items
            .eq('user_id', user_id);

        if (error) {
            console.error('Error fetching orders for user:', error.message);
            return res.status(500).json({ error: 'Failed to fetch orders for the user.' });
        }

        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'No orders found for this user.' });
        }

        res.status(200).json(data);
    } catch (err) {
        console.error('Unexpected error:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});


// Fetch All Orders
router.get('/all', async (req, res) => {
    try {
        // Fetch all orders
        const { data, error } = await supabase
            .from('orders')
            .select('*, orderitems(product_id, quantity, size_id)'); // Include associated items

        if (error) {
            console.error('Error fetching all orders:', error.message);
            return res.status(500).json({ error: 'Failed to fetch all orders.' });
        }

        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'No orders found in the database.' });
        }

        res.status(200).json({
            message: 'Orders fetched successfully!',
            orders: data
        });
    } catch (err) {
        console.error('Unexpected error:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

/// ------------------ Messages Endpoints ------------------ ///

// Send a Message (User or Superuser)
router.post('/messages', async (req, res) => {
    const { orderId, sender, message } = req.body;

    // Validate input
    if (!orderId || !sender || !message) {
        return res.status(400).json({ error: 'Order ID, sender, and message are required.' });
    }

    try {
        const { data, error } = await supabase
            .from('messages')
            .insert([{ order_id: orderId, sender, message }])
            .select(); // Return the inserted message

        if (error) {
            console.error('Error sending message:', error.message);
            return res.status(500).json({ error: 'Failed to send the message.' });
        }

        res.status(201).json({ message: 'Message sent successfully!', messageData: data });
    } catch (err) {
        console.error('Unexpected error:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Fetch All Messages for a Specific Order
router.post('/messages/fetch', async (req, res) => {
    const { order_id } = req.body; // Extract order_id from the request body

    // Validate input
    if (!order_id) {
        return res.status(400).json({ error: 'Order ID is required.' });
    }

    try {
        // Fetch messages for the order
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('order_id', order_id)
            .order('created_at', { ascending: true }); // Order messages by timestamp

        if (error) {
            console.error('Error fetching messages:', error.message);
            return res.status(500).json({ error: 'Failed to fetch messages.' });
        }

        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'No messages found for this order.' });
        }

        res.status(200).json(data);
    } catch (err) {
        console.error('Unexpected error:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
