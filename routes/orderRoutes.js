// routes/orderRoutes.js
import express from "express";
import {
  getAllOrders,
  createOrder,
  updateOrderStatus,
  markOrderAsReady,
  checkCancellationEligibility,
  cancelOrder,
  acceptOrder, // <-- Tambahan baru
  rejectOrder, // <-- Tambahan baru
} from "../controllers/orderController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

// --- PERUBAHAN DI SINI ---
// Terapkan middleware 'protect' agar hanya user yang sudah login bisa akses daftar pesanan
router.get("/", protect, getAllOrders);
// -------------------------

// --- Rute baru: untuk menerima atau menolak pesanan INCOMING ---
router.post("/:orderId/accept", acceptOrder);
router.post("/:orderId/reject", rejectOrder);

// --- Rute internal (butuh auth) ---
router.post("/", protect, createOrder);
router.put("/:orderId/status", updateOrderStatus);

// --- Rute untuk aksi keluar ke Grab ---
router.post("/:orderId/ready", markOrderAsReady);
router.get("/:orderId/cancelable", checkCancellationEligibility);
router.post("/:orderId/cancel", cancelOrder);

export default router;
