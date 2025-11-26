// routes/webhookRoutes.js
import express from "express";
import {
  receiveOrderStatus,
  handleMenuSyncState,
  handleIntegrationStatus,
  handlePushMenu,
  handleSubmitOrder,
} from "../controllers/webhookController.js";

import { verifyGrabSignature } from "../middlewares/verifyGrabSignature.js";

const router = express.Router();

// --- UPDATE: Matikan verifyGrabSignature sementara untuk Order Status ---
router.post("/order-status", receiveOrderStatus); // <--- HAPUS verifyGrabSignature

// Submit order juga tanpa signature (seperti sebelumnya)
router.post("/submit-order", handleSubmitOrder);

// Sisanya biarkan (atau matikan juga jika perlu debugging)
router.post("/menu-sync-state", verifyGrabSignature, handleMenuSyncState);
router.post(
  "/integration-status",
  verifyGrabSignature,
  handleIntegrationStatus
);
router.post("/push-menu", verifyGrabSignature, handlePushMenu);

export default router;
