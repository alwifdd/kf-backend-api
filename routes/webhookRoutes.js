import express from "express";

// Impor semua fungsi yang dibutuhkan dari controller dan middleware
import {
  receiveOrderStatus,
  handleMenuSyncState,
  handleIntegrationStatus,
  handlePushMenu,
  handleSubmitOrder, // <-- 1. Impor fungsi baru di sini
} from "../controllers/webhookController.js";

import { verifyGrabSignature } from "../middlewares/verifyGrabSignature.js";

const router = express.Router();

// --- PERBAIKAN: Sebaiknya semua webhook diamankan dengan signature ---
// Endpoint untuk menerima update status pesanan dari Grab
router.post("/order-status", verifyGrabSignature, receiveOrderStatus);

// Endpoint untuk menerima status sinkronisasi menu
router.post("/menu-sync-state", verifyGrabSignature, handleMenuSyncState);

// Endpoint untuk menerima status integrasi toko
router.post(
  "/integration-status",
  verifyGrabSignature,
  handleIntegrationStatus
);

// Endpoint untuk menerima push menu dari Grab
router.post("/push-menu", verifyGrabSignature, handlePushMenu);

// --- 2. Tambahkan Rute Baru untuk Menerima Pesanan ---
// Endpoint untuk menerima pesanan baru (Submit Order Webhook)
router.post("/submit-order", verifyGrabSignature, handleSubmitOrder);

export default router;
