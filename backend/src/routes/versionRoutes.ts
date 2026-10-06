import { Router } from 'express';
import {
  handleDownload,
  handleVersionInfo,
  handleUploadVersion,
  handleGetVersionsList,
} from '../controllers/versionController';
import { authenticateToken, requireAdmin } from '../middlewares/auth';
import { upload } from '../config/multer';

const router = Router();

router.get('/version/download', handleDownload);
router.get('/version', handleVersionInfo);
router.get('/version/list', handleGetVersionsList);

router.post(
  '/version',
  authenticateToken,
  requireAdmin,
  (req: any, res: any, next: any) => {
    upload.single('apkFile')(req, res, (err: any) => {
      if (err) {
        res.status(400).json({ error: `Error al subir el archivo: ${err.message}` });
        return;
      }
      next();
    });
  },
  handleUploadVersion
);

export default router;
