import { Router } from 'express';
import authRoutes from './authRoutes';
import versionRoutes from './versionRoutes';
import syncRoutes from './syncRoutes';
import surveyRoutes from './surveyRoutes';
import adminRoutes from './adminRoutes';

const apiRouter = Router();

apiRouter.use(authRoutes);
apiRouter.use(versionRoutes);
apiRouter.use(syncRoutes);
apiRouter.use(surveyRoutes);
apiRouter.use(adminRoutes);

export default apiRouter;
