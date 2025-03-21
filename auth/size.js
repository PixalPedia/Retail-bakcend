const express = require('express');
const { supabase } = require('../supabaseClient');
const router = express.Router();

// Helper Function: Check Superuser
const isSuperUser = async (user_id) => {
    try {
        const { data: superuser, error } = await supabase
            .from('superusers')
            .select('*')
            .eq('id', user_id)
            .single();

        if (error) {
            console.error('Superuser Check Error:', error.message);
            return false;
        }

        return superuser !== null;
    } catch (err) {
        console.error('Unexpected Error in Superuser Check:', err.message);
        return false;
    }
};

// Add Size
router.post('/add', async (req, res) => {
    const { size_name, user_id } = req.body;

    try {
        // Validate User ID
        if (!user_id) {
            return res.status(400).json({ error: 'User ID is required.' });
        }

        // Verify Superuser Permissions
        const isSuper = await isSuperUser(user_id);
        if (!isSuper) {
            return res.status(403).json({ error: 'Only superusers can add sizes.' });
        }

        // Validate Size Name
        const trimmedName = size_name?.trim();
        if (!trimmedName) {
            return res.status(400).json({ error: 'Size name is required.' });
        }

        // Insert Size into Database
        const { data, error } = await supabase
            .from('sizes')
            .insert([{ size_name: trimmedName }]) // No superuser_id stored here
            .select();

        if (error) {
            console.error('Insert Error:', error.message);
            return res.status(500).json({ error: `Failed to add size. Supabase error: ${error.message}` });
        }

        // Respond with Success
        res.status(201).json({
            message: 'Size added successfully!',
            size: data[0],
        });
    } catch (err) {
        console.error('Unexpected Error in Add Size:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});


// Fetch All Sizes
router.get('/list', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('sizes')
            .select('*')
            .order('size_name', { ascending: true });

        if (error) {
            console.error('Error Fetching Sizes:', error.message);
            return res.status(500).json({ error: 'Failed to fetch sizes.' });
        }

        res.status(200).json(data);
    } catch (err) {
        console.error('Error in Fetch Sizes:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Fetch Products by Size
router.post('/products', async (req, res) => {
    const { size_id } = req.body;

    try {
        // Validate Input
        if (!size_id) {
            return res.status(400).json({ error: 'Size ID is required.' });
        }

        // Fetch products linked to the given size ID through the bridge table
        const { data, error } = await supabase
            .from('product_sizes')
            .select(`
                product_id,
                products (
                    id,
                    title,
                    description,
                    price,
                    is_discounted,
                    discount_percentage,
                    images,
                    stock_quantity,
                    created_at
                )
            `)
            .eq('size_id', size_id);

        if (error) {
            console.error('Error fetching products by size ID:', error.message);
            return res.status(500).json({ error: 'Failed to fetch products for the given size.' });
        }

        if (!data || data.length === 0) {
            return res.status(404).json({ message: 'No products found for the given size.' });
        }

        // Extract products
        const products = data.map(entry => entry.products);

        res.status(200).json({
            message: `Products fetched successfully for size ID: ${size_id}`,
            products,
        });
    } catch (err) {
        console.error('Unexpected Error in Fetch Products by Size ID:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Delete Size
router.delete('/delete', async (req, res) => {
    const { id, user_id } = req.body;

    try {
        if (!user_id) {
            return res.status(400).json({ error: 'User ID is required.' });
        }

        if (!id) {
            return res.status(400).json({ error: 'Size ID is required.' });
        }

        const isSuper = await isSuperUser(user_id);
        if (!isSuper) {
            return res.status(403).json({ error: 'Only superusers can delete sizes.' });
        }

        const { data: size, error: fetchError } = await supabase
            .from('sizes')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !size) {
            return res.status(404).json({ error: 'Size not found.' });
        }

        const { data, error: deleteError } = await supabase
            .from('sizes')
            .delete()
            .eq('id', id);

        if (deleteError) {
            console.error('Size Deletion Error:', deleteError.message);
            return res.status(500).json({ error: `Failed to delete size. Supabase error: ${deleteError.message}` });
        }

        res.status(200).json({ message: `Size with ID ${id} successfully deleted.` });
    } catch (err) {
        console.error('Error in Delete Size:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
