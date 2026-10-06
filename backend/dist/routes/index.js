"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authRoutes_1 = __importDefault(require("./authRoutes"));
const versionRoutes_1 = __importDefault(require("./versionRoutes"));
const syncRoutes_1 = __importDefault(require("./syncRoutes"));
const surveyRoutes_1 = __importDefault(require("./surveyRoutes"));
const adminRoutes_1 = __importDefault(require("./adminRoutes"));
const apiRouter = (0, express_1.Router)();
apiRouter.use(authRoutes_1.default);
apiRouter.use(versionRoutes_1.default);
apiRouter.use(syncRoutes_1.default);
apiRouter.use(surveyRoutes_1.default);
apiRouter.use(adminRoutes_1.default);
exports.default = apiRouter;
