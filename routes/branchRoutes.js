// routes/branchRoutes.js
import express from "express";
// (UPDATE) Impor fungsi baru
import {
  getAllBranches,
  getListBMs,
  getBranchesByArea,
} from "../controllers/branchController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

// [TIDAK BERUBAH] Dipakai oleh BM (Backend otomatis filter by area)
router.get("/", protect, getAllBranches);

/* =====================================================
  TAMBAHKAN DUA RUTE BARU DI BAWAH INI
=====================================================
*/

// [BARU] [Super Admin] Rute untuk ambil daftar BM
router.get("/list-bms", protect, getListBMs);

// [BARU] [Super Admin] Rute untuk ambil cabang berdasarkan area
router.get("/by-area", protect, getBranchesByArea);

export default router;
