import { Router } from 'express';
import { handleSync } from '../controllers/syncController';
import { authenticateToken } from '../middlewares/auth';

const router = Router();

router.post('/sync', authenticateToken, handleSync);

export default router;
