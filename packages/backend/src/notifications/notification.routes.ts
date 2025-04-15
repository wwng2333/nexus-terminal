import { Router } from 'express';
import { NotificationController } from './notification.controller';
import { isAuthenticated } from '../auth/auth.middleware'; // Corrected import name

const router = Router();
const notificationController = new NotificationController();

// Apply auth middleware to all notification routes
router.use(isAuthenticated);

// Define routes for notification settings CRUD
router.get('/', notificationController.getAll);
router.post('/', notificationController.create);
router.put('/:id', notificationController.update);
router.delete('/:id', notificationController.delete);

// Route for testing a notification setting (currently only email)
router.post('/:id/test', notificationController.testSetting);

export default router;
