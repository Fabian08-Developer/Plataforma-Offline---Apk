import { Router } from 'express';
import { handleLogin } from '../controllers/authController';
import { limiteLoginPorIp, limiteLoginPorUsuario } from '../middlewares/rateLimit';

const router = Router();

router.post('/login', limiteLoginPorIp, limiteLoginPorUsuario, handleLogin);

export default router;
