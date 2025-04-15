import { Router } from 'express';
import { AuditController } from './audit.controller';
import { isAuthenticated } from '../auth/auth.middleware'; // Use the correct auth middleware

const router = Router();
const auditController = new AuditController();

// Apply auth middleware to protect the audit log endpoint
router.use(isAuthenticated);

// Define route for getting audit logs
router.get('/', auditController.getAuditLogs);

export default router;
