import express from 'express';
import { ChannelController } from '../controllers/channel-controller.js';
import { authenticateToken } from '../middlewares/auth-middleware.js';
import { CONSTANTS } from '../config/env.js';

const router = express.Router();

// Static routes first (to avoid conflicts with dynamic routes)
router.get('/search', authenticateToken, ChannelController.searchChannels);
router.get('/user/:userId', authenticateToken, ChannelController.getUserChannels);
router.get('/subscriptions/me', authenticateToken, ChannelController.getUserSubscriptions);
router.get('/@:handle', authenticateToken, ChannelController.getChannelByHandle);

// Channel CRUD
router.post('/', authenticateToken, ChannelController.createChannel);
router.get('/:channelId', authenticateToken, ChannelController.getChannel);
router.put('/:channelId', authenticateToken, ChannelController.updateChannel);
router.delete('/:channelId', authenticateToken, ChannelController.deleteChannel);

// Channel stats and subscriptions
router.get('/:channelId/stats', authenticateToken, ChannelController.getChannelStats);
router.post('/:channelId/subscribe', authenticateToken, ChannelController.subscribeToChannel);
router.delete('/:channelId/subscribe', authenticateToken, ChannelController.unsubscribeFromChannel);
router.get('/:channelId/subscription', authenticateToken, ChannelController.getSubscriptionStatus);

export const channelRoutes = router;
