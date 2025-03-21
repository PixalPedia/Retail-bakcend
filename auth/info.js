const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config(); // Load environment variables from .env

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

const router = express.Router();

// Fetch detailed information from all related tables
router.post('/get-detailed-info', async (req, res) => {
    const { user_id } = req.body; // Extract user_id from the request body

    try {
        if (!user_id) {
            return res.status(400).json({ error: 'User ID is required in the request body.' });
        }

        // Fetch user information from the 'users' table
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', user_id)
            .single();

        if (userError || !userData) {
            console.error('Error fetching user data:', userError?.message || 'User not found.');
            return res.status(404).json({ error: 'User not found in users table.' });
        }

        // Fetch reviews written by the user from the 'reviews' table
        const { data: reviewsData, error: reviewsError } = await supabase
            .from('reviews')
            .select('*')
            .eq('user_id', user_id);

        if (reviewsError) {
            console.error('Error fetching reviews:', reviewsError.message);
        }

        // Fetch replies written by the user from the 'replies' table
        const { data: repliesData, error: repliesError } = await supabase
            .from('replies')
            .select('*')
            .eq('user_id', user_id);

        if (repliesError) {
            console.error('Error fetching replies:', repliesError.message);
        }

        // Fetch orders made by the user from the 'orders' table
        const { data: ordersData, error: ordersError } = await supabase
            .from('orders')
            .select('id') // Only fetch 'id' for use in the next query
            .eq('user_id', user_id);

        if (ordersError) {
            console.error('Error fetching orders:', ordersError.message);
        }

        // Extract order IDs from ordersData
        const orderIds = ordersData ? ordersData.map((order) => order.id) : [];

        // Fetch messages related to the user's orders from the 'messages' table
        const { data: messagesData, error: messagesError } = await supabase
            .from('messages')
            .select('*')
            .in('order_id', orderIds); // Pass order IDs as an array

        if (messagesError) {
            console.error('Error fetching messages:', messagesError.message);
        }

        // Combine all fetched data into a single response
        const response = {
            user: userData, // Data from the 'users' table
            reviews: reviewsData || [], // Reviews by the user
            replies: repliesData || [], // Replies by the user
            messages: messagesData || [], // Messages related to the user's orders
            orders: ordersData || [], // Orders placed by the user
        };

        // Return the combined data
        res.status(200).json(response);

    } catch (err) {
        console.error('Unexpected error fetching detailed user info:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});


module.exports = router;
