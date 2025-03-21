const express = require('express');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import authentication-related controllers from auth.js
const {
    signup,
    login,
    requestOTPForPasswordReset,
    resetPasswordWithOTP,
    verifyEmailWithOTP,
    superuserLogin,
    resendOTP
} = require('./auth/auth');

// Import routes for products, categories, orders, and reviews
const productRoutes = require('./auth/product'); // Product routes
const categoryRoutes = require('./auth/category'); // Category routes
const orderRoutes = require('./auth/order'); // Order routes (includes orderitems and messages)
const reviewRoutes = require('./auth/review'); // Review routes (for reviews and replies)
const infoRouter = require('./auth/info'); // Info routes
const sizeRouter = require('./auth/size'); // Size routes
const cartRoutes = require('./auth/cart'); // Cart routes

// Initialize Express app
const app = express();

// Middleware
app.use(express.json()); // Built-in body-parser for parsing JSON requests

// Authentication Routes
app.post('/signup', signup); // User signup
app.post('/login', login); // User login
app.post('/superuser-login', superuserLogin); // Superuser login
app.post('/request-password-reset-otp', requestOTPForPasswordReset); // Request OTP for password reset
app.post('/reset-password-with-otp', resetPasswordWithOTP); // Reset password using OTP
app.post('/verify-email-with-otp', verifyEmailWithOTP); // Verify email using OTP
app.post('/resend-otp', resendOTP); // Resend OTP for email verification or password reset

// Product, Category, Order, and Review Routes
app.use('/api/products', productRoutes); // Endpoints for product-related operations
app.use('/api/categories', categoryRoutes); // Endpoints for category-related operations
app.use('/api/orders', orderRoutes); // Endpoints for order-related operations (includes orderitems and messages)
app.use('/api/reviews', reviewRoutes); // Endpoints for review-related operations
app.use('/api/info', infoRouter); // Endpoints for fetching user info
app.use('/api/sizes', sizeRouter); // Endpoints for size-related operations
app.use('/api/cart', cartRoutes); // Endpoints for cart-related operations

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    // Log the Render URL
    const renderUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    console.log(`🚀 Server is running at: ${renderUrl}`);
});
