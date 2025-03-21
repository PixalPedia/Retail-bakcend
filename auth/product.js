const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { supabase } = require('../supabaseClient'); // Import Supabase
const router = express.Router();

// Multer Setup for File Uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 4 * 1024 * 1024 }, // Max 4 MB per file
});

// Helper Function: Compress and Upload Images
const uploadImageToSupabase = async (buffer, fileName) => {
    try {
        console.log('Compressing image...');
        const compressedImage = await sharp(buffer)
            .resize(1024, 1024, { fit: 'inside' })
            .jpeg({ quality: 80 })
            .toBuffer();

        console.log('Uploading image to Supabase...');
        const timestamp = Date.now();
        const filePath = `products/${timestamp}-${fileName}`;
        const { data, error } = await supabase.storage
            .from('images') // Ensure the bucket name is 'images'
            .upload(filePath, compressedImage, {
                cacheControl: '3600',
                upsert: false,
                contentType: 'image/jpeg',
            });

        if (error) {
            console.error('Supabase Upload Error:', error.message);
            throw new Error('Image upload failed.');
        }

        console.log('Constructing public URL...');
        // Dynamically construct the URL based on SUPABASE_URL
        const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/images/${filePath}`;

        console.log(`Image successfully uploaded: ${publicUrl}`);
        return publicUrl;
    } catch (err) {
        console.error('Error during image upload:', err.message);
        throw err;
    }
};

// Helper Function: Check Superuser Permissions
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

// Add Product
router.post('/add', upload.array('images', 5), async (req, res) => {
    const {
        title,
        description,
        category_ids, // Array of category IDs
        size_ids, // Array of size IDs (optional)
        price,
        is_discounted,
        discount_percentage,
        stock_quantity,
        user_id
    } = req.body;
    const files = req.files;

    try {
        // Check Superuser Permissions
        if (!(await isSuperUser(user_id))) {
            return res.status(403).json({ error: 'Only superusers are allowed to add products.' });
        }

        // Validate and Parse `category_ids` and `size_ids` if provided
        let parsedCategoryIds = Array.isArray(category_ids) ? category_ids : JSON.parse(category_ids || "[]");
        let parsedSizeIds = size_ids ? (Array.isArray(size_ids) ? size_ids : JSON.parse(size_ids || "[]")) : [];

        // Validate `category_ids`
        if (!Array.isArray(parsedCategoryIds) || !parsedCategoryIds.every(id => Number.isInteger(Number(id)))) {
            return res.status(400).json({ error: 'category_ids must be an array of integers.' });
        }

        // Validate `size_ids` only if provided
        if (parsedSizeIds.length > 0 && !parsedSizeIds.every(id => Number.isInteger(Number(id)))) {
            return res.status(400).json({ error: 'size_ids must be an array of integers.' });
        }

        // Validate and Upload Images
        if (files.length > 5) {
            return res.status(400).json({ error: 'You can upload a maximum of 5 images.' });
        }

        const imageUrls = [];
        for (const file of files) {
            try {
                const imageUrl = await uploadImageToSupabase(file.buffer, file.originalname);
                imageUrls.push(imageUrl);
            } catch (err) {
                console.error(`Error uploading image ${file.originalname}:`, err.message);
            }
        }

        if (imageUrls.length === 0) {
            return res.status(400).json({ error: 'No images were successfully uploaded.' });
        }

        // Insert Product into `products` Table
        const { data: productData, error: productError } = await supabase
            .from('products')
            .insert([{
                title,
                description,
                price: parseFloat(price),
                is_discounted: is_discounted === 'true',
                discount_percentage: discount_percentage ? parseFloat(discount_percentage) : null,
                images: imageUrls,
                stock_quantity: parseInt(stock_quantity) || 0
            }])
            .select();

        if (productError) {
            console.error('Error adding product to database:', productError.message);
            return res.status(500).json({ error: 'Failed to add product to the database.' });
        }

        const productId = productData[0].id;

        // Link Product to Categories in `product_categories`
        if (parsedCategoryIds.length > 0) {
            const categoryEntries = parsedCategoryIds.map(catId => ({
                product_id: productId,
                category_id: catId
            }));

            const { error: categoryLinkError } = await supabase
                .from('product_categories')
                .insert(categoryEntries);

            if (categoryLinkError) {
                console.error('Error linking product to categories:', categoryLinkError.message);
                return res.status(500).json({ error: 'Failed to link product to categories.' });
            }
        } else {
            return res.status(400).json({ error: 'At least one category ID is required.' });
        }

        // Link Product to Sizes in `product_sizes` only if sizes are provided
        if (parsedSizeIds.length > 0) {
            const sizeEntries = parsedSizeIds.map(sizeId => ({
                product_id: productId,
                size_id: sizeId
            }));

            const { error: sizeLinkError } = await supabase
                .from('product_sizes')
                .insert(sizeEntries);

            if (sizeLinkError) {
                console.error('Error linking product to sizes:', sizeLinkError.message);
                return res.status(500).json({ error: 'Failed to link product to sizes.' });
            }
        }

        // Respond with Success
        res.status(201).json({
            message: 'Product added successfully!',
            product: productData[0]
        });
    } catch (err) {
        console.error('Unexpected Error:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Fetch Product by ID
router.post('/fetch', async (req, res) => {
    const { product_id } = req.body; // Extract product_id from request body

    try {
        // Validate product_id
        if (!product_id || isNaN(product_id)) {
            return res.status(400).json({ error: 'A valid product ID is required.' });
        }

        // Query the product from the database
        const { data: product, error } = await supabase
            .from('products')
            .select('*')
            .eq('id', product_id)
            .single(); // Ensure we only get one product

        if (error || !product) {
            console.error('Error fetching product:', error?.message || 'Product not found');
            return res.status(404).json({ error: 'Product not found.' });
        }

        // Respond with the product data
        res.status(200).json({
            message: 'Product fetched successfully!',
            product
        });
    } catch (err) {
        console.error('Unexpected error in fetching product:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Update Product by ID
router.put('/update', async (req, res) => {
    const { 
        user_id, // ID of the user attempting to update
        product_id, 
        title, 
        description, 
        price, 
        is_discounted, 
        discount_percentage, 
        stock_quantity, 
        images, 
        category_ids, 
        size_ids 
    } = req.body;

    try {
        // Validate User ID and Product ID
        if (!user_id || !product_id) {
            return res.status(400).json({ error: 'User ID and Product ID are required to update a product.' });
        }

        // Check if the user is a superuser
        const isSuper = await isSuperUser(user_id);
        if (!isSuper) {
            return res.status(403).json({ error: 'Only superusers are allowed to update products.' });
        }

        // Prepare the fields to update
        const fieldsToUpdate = {};
        if (title) fieldsToUpdate.title = title;
        if (description) fieldsToUpdate.description = description;
        if (price !== undefined) fieldsToUpdate.price = parseFloat(price);
        if (is_discounted !== undefined) fieldsToUpdate.is_discounted = is_discounted === 'true';
        if (discount_percentage !== undefined) fieldsToUpdate.discount_percentage = discount_percentage ? parseFloat(discount_percentage) : null;
        if (stock_quantity !== undefined) fieldsToUpdate.stock_quantity = parseInt(stock_quantity);
        if (images) fieldsToUpdate.images = images;

        // Check if there are any fields to update
        if (Object.keys(fieldsToUpdate).length > 0) {
            // Update the product in the `products` table
            const { data: updatedProduct, error: updateError } = await supabase
                .from('products')
                .update(fieldsToUpdate)
                .eq('id', product_id)
                .select();

            if (updateError) {
                console.error('Error updating product:', updateError.message);
                return res.status(500).json({ error: 'Failed to update product.' });
            }
        }

        // Update Categories in `product_categories` (if provided)
        if (category_ids && Array.isArray(category_ids)) {
            const { error: deleteCategoriesError } = await supabase
                .from('product_categories')
                .delete()
                .eq('product_id', product_id);

            if (deleteCategoriesError) {
                console.error('Error clearing existing categories:', deleteCategoriesError.message);
                return res.status(500).json({ error: 'Failed to update product categories.' });
            }

            const categoryEntries = category_ids.map(catId => ({
                product_id,
                category_id: catId
            }));

            const { error: insertCategoriesError } = await supabase
                .from('product_categories')
                .insert(categoryEntries);

            if (insertCategoriesError) {
                console.error('Error updating product categories:', insertCategoriesError.message);
                return res.status(500).json({ error: 'Failed to update product categories.' });
            }
        }

        // Update Sizes in `product_sizes` (if provided)
        if (size_ids && Array.isArray(size_ids)) {
            const { error: deleteSizesError } = await supabase
                .from('product_sizes')
                .delete()
                .eq('product_id', product_id);

            if (deleteSizesError) {
                console.error('Error clearing existing sizes:', deleteSizesError.message);
                return res.status(500).json({ error: 'Failed to update product sizes.' });
            }

            const sizeEntries = size_ids.map(sizeId => ({
                product_id,
                size_id: sizeId
            }));

            const { error: insertSizesError } = await supabase
                .from('product_sizes')
                .insert(sizeEntries);

            if (insertSizesError) {
                console.error('Error updating product sizes:', insertSizesError.message);
                return res.status(500).json({ error: 'Failed to update product sizes.' });
            }
        }

        res.status(200).json({
            message: 'Product updated successfully!'
        });
    } catch (err) {
        console.error('Unexpected error while updating product:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Fetch All Products
router.get('/list', async (req, res) => {
    try {
        const { data: products, error } = await supabase
            .from('products')
            .select('*, category:categories(name)'); // Include categories relationship

        if (error) {
            console.error('Error fetching products:', error.message);
            return res.status(500).json({ error: error.message });
        }

        res.status(200).json(products);
    } catch (err) {
        console.error('Unexpected Error in Fetching Products:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
