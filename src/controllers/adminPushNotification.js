const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Rider = require('../models/Rider');
const Notification = require('../models/Notification');
const { uploadToCloudinary } = require('../utils/cloudinary');
const {
    sendPushNotification,
    sendVendorPushNotification,
    sendRiderPushNotification
} = require('../utils/firebaseNotification');
const logger = require('../utils/logger');

// Background functions for sending bulk notifications
const processPushNotificationsForUsers = async (userIds, title, message, imageUrl) => {
    try {
        const users = await User.find({ _id: { $in: userIds }, isActive: true });

        // Create notifications in DB
        const notifications = users.map(user => ({
            recipient: user._id,
            recipientModel: 'User',
            type: 'general',
            title,
            message,
            imageUrl,
        }));

        if (notifications.length > 0) {
            await Notification.insertMany(notifications);
        }

        // Send push notifications
        for (const user of users) {
            if (user.fcmToken || (user.fcmTokens && user.fcmTokens.length > 0)) {
                await sendPushNotification(user._id, { title, message, type: 'general', imageUrl });
            }
        }
    } catch (error) {
        logger.error('Error processing push notifications for users:', error);
    }
};

const processPushNotificationsForVendors = async (vendorIds, title, message, imageUrl) => {
    try {
        const vendors = await Vendor.find({ _id: { $in: vendorIds }, isActive: true });

        const notifications = vendors.map(vendor => ({
            recipient: vendor._id,
            recipientModel: 'Vendor',
            type: 'general',
            title,
            message,
            imageUrl,
        }));

        if (notifications.length > 0) {
            await Notification.insertMany(notifications);
        }

        for (const vendor of vendors) {
            if (vendor.fcmToken || (vendor.fcmTokens && vendor.fcmTokens.length > 0)) {
                await sendVendorPushNotification(vendor._id, { title, message, type: 'general', imageUrl });
            }
        }
    } catch (error) {
        logger.error('Error processing push notifications for vendors:', error);
    }
};

const processPushNotificationsForRiders = async (riderIds, title, message, imageUrl) => {
    try {
        const riders = await Rider.find({ _id: { $in: riderIds }, isActive: true });

        const notifications = riders.map(rider => ({
            recipient: rider._id,
            recipientModel: 'Rider',
            type: 'general',
            title,
            message,
            imageUrl,
        }));

        if (notifications.length > 0) {
            await Notification.insertMany(notifications);
        }

        for (const rider of riders) {
            if (rider.fcmToken || (rider.fcmTokens && rider.fcmTokens.length > 0)) {
                await sendRiderPushNotification(rider._id, { title, message, type: 'general', imageUrl });
            }
        }
    } catch (error) {
        logger.error('Error processing push notifications for riders:', error);
    }
};


exports.sendCustomPushNotification = async (req, res) => {
    try {
        const { title, message, targetGroup, specificIds } = req.body;
        let imageUrl = null;

        if (!title || !message) {
            return res.status(400).json({ success: false, error: 'Title and message are required' });
        }

        if (!targetGroup) {
            return res.status(400).json({ success: false, error: 'Target group is required (User, Vendor, Rider)' });
        }

        // Process image upload
        if (req.files && req.files['image'] && req.files['image'][0]) {
            const uploadResult = await uploadToCloudinary(req.files['image'][0], 'notifications');
            imageUrl = uploadResult.url;
        }

        let parsedSpecificIds = [];
        if (specificIds) {
            try {
                parsedSpecificIds = typeof specificIds === 'string' ? JSON.parse(specificIds) : specificIds;
            } catch (e) {
                parsedSpecificIds = [specificIds];
            }
        }

        const groups = Array.isArray(targetGroup) ? targetGroup : [targetGroup];
        let totalScheduled = 0;

        for (const group of groups) {
            if (group === 'User') {
                let userIds = [];
                if (parsedSpecificIds.length > 0) {
                    userIds = parsedSpecificIds;
                } else {
                    const users = await User.find({ isActive: true }).select('_id');
                    userIds = users.map(u => u._id);
                }
                processPushNotificationsForUsers(userIds, title, message, imageUrl);
                totalScheduled += userIds.length;
            }
            else if (group === 'Vendor') {
                let vendorIds = [];
                if (parsedSpecificIds.length > 0) {
                    vendorIds = parsedSpecificIds;
                } else {
                    const vendors = await Vendor.find({ isActive: true }).select('_id');
                    vendorIds = vendors.map(v => v._id);
                }
                processPushNotificationsForVendors(vendorIds, title, message, imageUrl);
                totalScheduled += vendorIds.length;
            }
            else if (group === 'Rider') {
                let riderIds = [];
                if (parsedSpecificIds.length > 0) {
                    riderIds = parsedSpecificIds;
                } else {
                    const riders = await Rider.find({ isActive: true }).select('_id');
                    riderIds = riders.map(r => r._id);
                }
                processPushNotificationsForRiders(riderIds, title, message, imageUrl);
                totalScheduled += riderIds.length;
            }
        }

        res.status(200).json({
            success: true,
            message: `Push notifications scheduled successfully for ${totalScheduled} recipients.`,
            imageUrl,
            totalScheduled
        });

    } catch (error) {
        logger.error('Error in sendCustomPushNotification:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to schedule push notifications',
            message: error.message,
        });
    }
};
