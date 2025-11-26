import express from "express";
import {
  receiveOrderStatus,
  handleMenuSyncState,
  handleIntegrationStatus,
  handlePushMenu,
  handleSubmitOrder,
} from "../controllers/webhookController.js";

// KITA MATIKAN DULU IMPORT SIGNATURE UNTUK DEBUGGING TOTAL
// import { verifyGrabSignature } from "../middlewares/verifyGrabSignature.js";

const router = express.Router();

// SEMUA WEBHOOK DIBUKA TANPA PASSWORD (SIGNATURE) SEMENTARA
// Agar kita yakin data bisa masuk ke DB dulu

router.post("/order-status", receiveOrderStatus);
router.post("/submit-order", handleSubmitOrder); // <--- INI PENTING
router.post("/menu-sync-state", handleMenuSyncState);
router.post("/integration-status", handleIntegrationStatus);
router.post("/push-menu", handlePushMenu);

export default router;
