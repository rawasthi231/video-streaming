import express from 'express';
import { AuthController } from '../controllers/auth-controller.js';
import { authenticateToken, authRateLimit } from '../middlewares/auth-middleware.js';
import { CONSTANTS } from '../config/env.js';

// Router for authentication routes
const router = express.Router();

// Public routes
router.post('/register', authRateLimit, AuthController.register);
router.post('/login', authRateLimit, AuthController.login);
router.post('/refresh', AuthController.refresh);

// Protected routes
router.post('/logout', authenticateToken, AuthController.logout);
router.get('/profile', authenticateToken, AuthController.profile);
router.post('/change-password', authenticateToken, AuthController.changePassword);

export const authRoutes = router;
