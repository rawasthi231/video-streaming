import express from 'express';
import { UserController } from '../controllers/user-controller.js';
import { authenticateToken } from '../middlewares/auth-middleware.js';

const router = express.Router();

// Current user (convenience endpoint)
router.get('/me', authenticateToken, UserController.getCurrentUser);

// User profile management
router.get('/:userId', authenticateToken, UserController.getUserProfile);
router.put('/:userId', authenticateToken, UserController.updateUserProfile);
router.delete('/:userId', authenticateToken, UserController.deactivateUser);

// Session management
router.get('/:userId/sessions', authenticateToken, UserController.getUserSessions);
router.post('/:userId/sessions/:sessionId/revoke', authenticateToken, UserController.revokeSession);

export const userRoutes = router;
