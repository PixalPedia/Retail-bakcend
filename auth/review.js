const express = require('express');
const { supabase } = require('../supabaseClient'); // Import Supabase client
const router = express.Router();
/// ------------------ Review Endpoints ------------------ ///

// Add a new review
router.post('/add', async (req, res) => {
    const { user_id, name, product_id, rating, feedback } = req.body;

    if (!user_id || !name || !product_id || !rating || !feedback) {
        return res.status(400).json({ error: 'All fields (user_id, name, product_id, rating, feedback) are required.' });
    }

    try {
        // Insert the review
        const { data: reviewData, error: reviewError } = await supabase
            .from('reviews')
            .insert([{ user_id, username: name, product_id, rating: parseFloat(rating), feedback }])
            .select();

        if (reviewError) {
            console.error('Error inserting review:', reviewError.message);
            return res.status(400).json({ error: reviewError.message });
        }

        res.status(201).json({
            message: 'Review submitted successfully!',
            review: reviewData[0],
        });
    } catch (err) {
        console.error('Unexpected Review Submission Error:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});


// Add a reply to a review
router.post('/reply', async (req, res) => {
    const { review_id, product_id, user_id, name, reply } = req.body;

    if (!review_id || !product_id || !user_id || !name || !reply) {
        return res.status(400).json({ error: 'All fields (review_id, product_id, user_id, name, reply) are required.' });
    }

    try {
        // Insert the reply
        const { data: replyData, error: replyError } = await supabase
            .from('replies')
            .insert([{ review_id, product_id, user_id, username: name, reply }])
            .select();

        if (replyError) {
            console.error('Error inserting reply:', replyError.message);
            return res.status(400).json({ error: replyError.message });
        }

        res.status(201).json({
            message: 'Reply submitted successfully!',
            reply: replyData[0],
        });
    } catch (err) {
        console.error('Unexpected Reply Submission Error:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Fetch all reviews with replies
router.get('/reviews', async (req, res) => {
    const { product_id } = req.query;

    if (!product_id) {
        return res.status(400).json({ error: 'Product ID is required to fetch reviews.' });
    }

    try {
        // Fetch all reviews with associated replies for the specified product
        const { data, error } = await supabase
            .from('reviews')
            .select(`
                id,
                user_id,
                product_id,
                username,
                rating,
                feedback,
                created_at,
                replies (
                    id,
                    review_id,
                    product_id,
                    user_id,
                    username,
                    reply,
                    created_at
                )
            `)
            .eq('product_id', product_id)
            .order('created_at', { ascending: false }); // Sort by newest reviews first

        if (error) {
            console.error('Error fetching reviews:', error.message);
            return res.status(400).json({ error: error.message });
        }

        res.status(200).json({
            message: 'Reviews fetched successfully!',
            reviews: data,
        });
    } catch (err) {
        console.error('Unexpected Reviews Fetch Error:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});


module.exports = router;

