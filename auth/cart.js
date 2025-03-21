const express = require('express');
const { supabase } = require('../supabaseClient');
const router = express.Router();

// Add Product to Cart
router.post('/add', async (req, res) => {
    const { user_id, product_id, size_id, quantity } = req.body;

    try {
        // Validate input
        if (!user_id || !product_id || quantity <= 0) {
            return res.status(400).json({ error: 'User ID, Product ID, and valid quantity are required.' });
        }

        // Add product to the cart
        const { data, error } = await supabase
            .from('cart')
            .insert([{
                user_id,
                product_id,
                size_id: size_id || null, // Optional size
                quantity: quantity || 1 // Default quantity to 1 if not provided
            }])
            .select();

        if (error) {
            console.error('Error adding product to cart:', error.message);
            return res.status(500).json({ error: 'Failed to add product to cart.' });
        }

        res.status(201).json({
            message: 'Product added to cart successfully!',
            cart_item: data[0]
        });
    } catch (err) {
        console.error('Unexpected error while adding to cart:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Fetch Cart Items
router.post('/fetch', async (req, res) => {
    const { user_id } = req.body;

    try {
        // Validate input
        if (!user_id) {
            return res.status(400).json({ error: 'User ID is required to fetch cart items.' });
        }

        // Fetch cart items for the user
        const { data, error } = await supabase
            .from('cart')
            .select(`
                id,
                product_id,
                size_id,
                quantity,
                added_at,
                products (
                    id,
                    title,
                    description,
                    price,
                    images,
                    stock_quantity
                ),
                sizes (
                    id,
                    size_name
                )
            `)
            .eq('user_id', user_id);

        if (error) {
            console.error('Error fetching cart items:', error.message);
            return res.status(500).json({ error: 'Failed to fetch cart items.' });
        }

        res.status(200).json({
            message: 'Cart items fetched successfully!',
            cart_items: data
        });
    } catch (err) {
        console.error('Unexpected error while fetching cart items:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Delete Product from Cart
router.delete('/delete', async (req, res) => {
    const { user_id, cart_item_id } = req.body;

    try {
        // Validate input
        if (!user_id || !cart_item_id) {
            return res.status(400).json({ error: 'User ID and Cart Item ID are required to delete a product from the cart.' });
        }

        // Check if the cart item exists before attempting to delete
        const { data: existingItem, error: fetchError } = await supabase
            .from('cart')
            .select('*')
            .eq('id', cart_item_id)
            .eq('user_id', user_id)
            .single();

        if (fetchError || !existingItem) {
            return res.status(404).json({ error: 'Cart item not found.' });
        }

        // Delete the product from the cart
        const { error: deleteError } = await supabase
            .from('cart')
            .delete()
            .eq('id', cart_item_id)
            .eq('user_id', user_id);

        if (deleteError) {
            console.error('Error deleting product from cart:', deleteError.message);
            return res.status(500).json({ error: 'Failed to delete product from cart.' });
        }

        res.status(200).json({
            message: 'Product removed from cart successfully!',
            deleted_item: existingItem // Return the previously fetched item as confirmation
        });
    } catch (err) {
        console.error('Unexpected error while deleting from cart:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Place Order
router.post('/place-order', async (req, res) => {
    const { user_id } = req.body;

    try {
        // Validate input
        if (!user_id) {
            return res.status(400).json({ error: 'User ID is required to place an order.' });
        }

        // Fetch cart items for the user
        const { data: cartItems, error: cartError } = await supabase
            .from('cart')
            .select('*')
            .eq('user_id', user_id);

        if (cartError || !cartItems || cartItems.length === 0) {
            return res.status(400).json({ error: 'No items in the cart to place an order.' });
        }

        // Create a new order
        const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .insert([{ user_id, order_status: 'Pending', created_at: new Date().toISOString() }])
            .select()
            .single();

        if (orderError) {
            console.error('Error creating order:', orderError.message);
            return res.status(500).json({ error: 'Failed to create the order.' });
        }

        const orderId = orderData.id;

        // Format cart items for insertion into orderitems
        const orderItems = cartItems.map(item => ({
            order_id: orderId,
            product_id: item.product_id,
            size_id: item.size_id,
            quantity: item.quantity
        }));

        // Insert items into orderitems table
        const { data: orderItemsData, error: orderItemsError } = await supabase
            .from('orderitems')
            .insert(orderItems)
            .select();

        if (orderItemsError) {
            console.error('Error inserting order items:', orderItemsError.message);
            return res.status(500).json({ error: 'Failed to add items to the order.' });
        }

        // Clear the user's cart
        const { error: clearCartError } = await supabase
            .from('cart')
            .delete()
            .eq('user_id', user_id);

        if (clearCartError) {
            console.error('Error clearing cart:', clearCartError.message);
            return res.status(500).json({ error: 'Failed to clear the cart after placing the order.' });
        }

        res.status(201).json({
            message: 'Order placed successfully!',
            order: orderData,
            order_items: orderItemsData
        });
    } catch (err) {
        console.error('Unexpected error while placing the order:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
