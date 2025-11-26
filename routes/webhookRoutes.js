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

/**
 * ----------------------------------------------------------------
 *  🔄 WEBHOOK: Submit Order (DISABLE SIGNATURE SEMENTARA)
 * ----------------------------------------------------------------
 *  Dipakai untuk mengetes apakah payload Grab berhasil masuk
 *  ke backend dan masuk ke Supabase.
 * ----------------------------------------------------------------
 */
router.post("/submit-order", handleSubmitOrder);

/**
 * ----------------------------------------------------------------
 *  🟢 WEBHOOK LAIN (MASIH MENGGUNAKAN SIGNATURE)
 * ----------------------------------------------------------------
 */

// Status pesanan (order-status webhook)
router.post("/order-status", verifyGrabSignature, receiveOrderStatus);

// Status sinkronisasi menu (menu-sync-state)
router.post("/menu-sync-state", verifyGrabSignature, handleMenuSyncState);

// Status integrasi dengan GrabMart Partner (integration-status)
router.post(
  "/integration-status",
  verifyGrabSignature,
  handleIntegrationStatus
);

// Push menu otomatis dari Grab (push-menu)
router.post("/push-menu", verifyGrabSignature, handlePushMenu);

export default router;
