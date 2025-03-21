const nodemailer = require('nodemailer');
const { supabase, supabaseAdmin } = require('../supabaseClient'); // Import Supabase clients
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Helper to generate 6-digit OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Configure nodemailer for Gmail SMTP
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_ADDRESS,  // Gmail address
        pass: process.env.EMAIL_PASSWORD // Gmail app password
    },
});

// Function to send OTP via email
const sendOTPEmail = async (email, otp, purpose) => {
    const mailOptions = {
        from: process.env.EMAIL_ADDRESS,
        to: email,
        subject: `Your OTP for ${purpose}`, // Dynamic subject based on purpose
        html: `
            <div style="font-family: Arial, sans-serif; text-align: center; color: #333; padding: 20px;">
                <h1 style="font-size: 24px; margin-bottom: 20px;">Here's your <strong>Lakshit's Test Site</strong> code!</h1>
                
                <!-- OTP Container -->
                <div style="font-size: 35px; font-weight: bold; background-color: #f7f7f7; padding: 15px; border-radius: 8px; display: inline-block; margin: 20px auto;">
                    ${otp}
                </div>
                
                <p style="font-size: 14px; color: #666; margin-bottom: 20px;">The code expires in <strong>10 minutes</strong>.</p>

                <!-- Message about purpose -->
                <p style="font-size: 18px; margin-bottom: 20px;">Continue with <strong>${purpose}</strong> by entering the code below.</p>

                <!-- Company Logo Container -->
                <div style="margin: 20px auto;">
                    <img src="https://sqvkozxfdnieonfbimyy.supabase.co/storage/v1/object/public/images/Logo%20lakshit.PNG" 
                        alt="Company Logo" 
                        style="width: 150px; height: auto; border-radius: 8px;" />
                </div>
                
                <p style="font-size: 14px; color: #666; margin-top: 20px;">Thank you for choosing <strong>Lakshit's Test Site.</strong>!</p>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`OTP sent to ${email}`);
    } catch (error) {
        console.error('Error sending OTP email:', error.message);
        throw new Error('Failed to send OTP email');
    }
};

// Signup Function
const signup = async (req, res) => {
    const { email, password, username } = req.body;

    try {
        // Create the user in Supabase Auth
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { username, email_verified: false } }
        });

        if (error) {
            console.error('Signup Error:', error.message);
            return res.status(400).json({ error: error.message });
        }

        // Generate OTP for email verification
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

        // Save OTP in the database
        await supabase.from('otps').insert({
            email,
            otp,
            purpose: 'email_verification',
            expires_at: expiresAt,
        });

        // Send OTP to user email
        await sendOTPEmail(email, otp, 'Email Verification');

        res.status(200).json({
            message: 'Signup successful! Please verify your email using the OTP sent to your email.',
            user: { id: data.user.id, email: data.user.email, username },
        });
    } catch (err) {
        console.error('Unexpected Signup Error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
};


// Login Function
const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        // Attempt to log in with email and password
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (authError) {
            console.error('Authentication Error:', authError.message);
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Check if email is confirmed
        const emailConfirmed = authData.user.email_confirmed_at !== null;
        const emailVerified = authData.user.user_metadata?.email_verified || false;

        if (!emailConfirmed || !emailVerified) {
            console.warn('Unverified email login attempt:', email);
            return res.status(401).json({ error: 'Email not verified. Please verify your email first.' });
        }

        // Retrieve username
        const username = authData.user.user_metadata?.username || 'Unknown User';

        // Generate JWT token
        const token = jwt.sign(
            { id: authData.user.id, email: authData.user.email, username },
            process.env.JWT_SECRET,
            { expiresIn: '1h' } // 1-hour token expiry
        );

        res.status(200).json({
            message: 'Login successful.',
            token,
            user: {
                id: authData.user.id,
                username,
                email: authData.user.email,
            },
        });
    } catch (err) {
        console.error('Unexpected Login Error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Request OTP for Password Reset
const requestOTPForPasswordReset = async (req, res) => {
    const { email } = req.body;

    try {
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await supabase.from('otps').insert({
            email,
            otp,
            purpose: 'password_reset',
            expires_at: expiresAt,
        });

        await sendOTPEmail(email, otp, 'Password Reset');

        res.status(200).json({ message: 'OTP sent for password reset. Please check your email.' });
    } catch (err) {
        console.error('Error requesting OTP for password reset:', err.message);
        res.status(500).json({ error: 'Failed to generate or send OTP.' });
    }
};

// Superuser Login Function
const superuserLogin = async (req, res) => {
    const { email, password } = req.body;

    // Sanity check for request body
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        // Fetch superuser from the database
        const { data: superuser, error } = await supabase
            .from('superusers') // Use lowercase table name
            .select('*')
            .eq('email', email)
            .single();

        if (error || !superuser) {
            console.warn('Superuser not found or query error:', error);
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        console.log('Superuser fetched:', superuser);

        // Compare the plain text password with the hashed password
        const isPasswordValid = await bcrypt.compare(password, superuser.password);
        if (!isPasswordValid) {
            console.warn('Invalid password attempt for email:', email);
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Generate a JWT token
        const token = jwt.sign(
            {
                id: superuser.id,
                email: superuser.email,
                username: superuser.username,
                is_superuser: true,
            },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        console.log('JWT token generated for superuser:', email);

        // Respond with success
        res.status(200).json({
            message: 'Superuser login successful.',
            token,
            user: {
                id: superuser.id,
                email: superuser.email,
                username: superuser.username,
                is_superuser: true,
            },
        });
    } catch (err) {
        console.error('Superuser Login Error:', err.message);
        res.status(500).json({ error: 'Internal server error. Please try again later.' });
    }
};

// Reset Password with OTP
const resetPasswordWithOTP = async (req, res) => {
    const { email, otp, new_password } = req.body;

    try {
        // Fetch the latest OTP for the given email and purpose
        const { data: otpRecord, error } = await supabase
            .from('otps')
            .select('*')
            .eq('email', email.toLowerCase())
            .eq('purpose', 'password_reset')
            .order('expires_at', { ascending: false }) // Get the most recent OTP
            .limit(1)
            .single();

        if (error || !otpRecord) {
            console.error('OTP Retrieval Error:', error?.message || 'No OTP record found.');
            return res.status(400).json({ error: 'Invalid or expired OTP.' });
        }

        // Validate OTP and expiration
        const isOTPValid = otpRecord.otp === otp && new Date() <= new Date(otpRecord.expires_at);
        if (!isOTPValid) {
            return res.status(400).json({ error: 'Invalid or expired OTP.' });
        }

        // Fetch the user from the Supabase Admin API
        const { data: userList, error: userListError } = await supabaseAdmin.auth.admin.listUsers();
        if (userListError) {
            console.error('User Retrieval Error:', userListError.message);
            return res.status(500).json({ error: 'Failed to retrieve user.' });
        }

        const user = userList.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Update the user's password directly in Supabase (it hashes automatically)
        const { error: adminError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
            password: new_password, // Provide plain text password; Supabase will hash it internally
        });

        if (adminError) {
            console.error('Password Update Error:', adminError.message);
            return res.status(500).json({ error: 'Failed to update password.' });
        }

        // Delete the used OTP from the database
        await supabase.from('otps').delete().eq('id', otpRecord.id);

        // Respond with success
        res.status(200).json({ message: 'Password reset successful!' });
    } catch (err) {
        console.error('Password Reset Error:', err.message);
        res.status(500).json({ error: 'Failed to reset password. Please try again later.' });
    }
};


// Verify Email with OTP
const verifyEmailWithOTP = async (req, res) => {
    const { email, otp } = req.body;

    try {
        // Fetch the latest OTP
        const { data: otpRecord, error } = await supabase
            .from('otps')
            .select('*')
            .eq('email', email)
            .eq('purpose', 'email_verification')
            .order('expires_at', { ascending: false }) // Get the most recent OTP
            .limit(1)
            .single();

        if (error || !otpRecord) {
            console.error('OTP Fetch Error:', error?.message || 'No OTP record found.');
            return res.status(400).json({ error: 'Invalid or expired OTP.' });
        }

        // Validate the OTP
        const isOTPValid = otpRecord.otp === otp && new Date() <= new Date(otpRecord.expires_at);
        if (!isOTPValid) {
            return res.status(400).json({ error: 'Invalid or expired OTP.' });
        }

        // Retrieve the user using Supabase Admin API
        const { data: userList, error: userListError } = await supabaseAdmin.auth.admin.listUsers();
        if (userListError) {
            console.error('User Retrieval Error:', userListError.message);
            return res.status(500).json({ error: 'Failed to retrieve user.' });
        }

        const user = userList.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Update email_verified in metadata and Supabase's internal state
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
            user_metadata: { ...user.user_metadata, email_verified: true },
            email_confirm: true, // Mark internal email confirmation as true
        });

        if (updateError) {
            console.error('Email Verification Error:', updateError.message);
            return res.status(500).json({ error: 'Failed to verify email.' });
        }

        // Delete the OTP
        await supabase.from('otps').delete().eq('id', otpRecord.id);

        res.status(200).json({ message: 'Email verified successfully!' });
    } catch (err) {
        console.error('Email Verification Error:', err.message);
        res.status(500).json({ error: 'Failed to verify email.' });
    }
};


// Resend OTP Function
const resendOTP = async (req, res) => {
    const { email, purpose } = req.body;

    // Validate request body
    if (!email || !purpose) {
        return res.status(400).json({ error: 'Email and purpose are required.' });
    }

    try {
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // OTP expiry: 10 minutes

        // Delete any existing OTP for the email and purpose
        await supabase
            .from('otps')
            .delete()
            .eq('email', email)
            .eq('purpose', purpose);

        // Save the new OTP in the database
        const { error: otpError } = await supabase.from('otps').insert({
            email,
            otp,
            purpose,
            expires_at: expiresAt,
        });

        if (otpError) {
            console.error('Error saving OTP:', otpError.message);
            return res.status(500).json({ error: 'Failed to generate OTP. Please try again.' });
        }

        // Send OTP via email
        try {
            await sendOTPEmail(email, otp, purpose === 'password_reset' ? 'Password Reset' : 'Email Verification');
        } catch (emailError) {
            console.error('Email Send Error:', emailError.message);
            return res.status(500).json({ error: 'Failed to send OTP email. Please try again.' });
        }

        // Respond with success message
        res.status(200).json({
            message: `A new OTP has been sent for ${purpose === 'password_reset' ? 'password reset' : 'email verification'}. Please check your email.`,
        });
    } catch (err) {
        console.error('Error resending OTP:', err.message);
        res.status(500).json({ error: 'Failed to resend OTP. Please try again later.' });
    }
};



// Export all handlers
module.exports = {
    signup,
    login,
    superuserLogin,
    requestOTPForPasswordReset,
    resetPasswordWithOTP,
    verifyEmailWithOTP,
    resendOTP,
};
