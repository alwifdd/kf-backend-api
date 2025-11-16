// routes/inventoryRoutes.js
import express from "express";
import { getInventoryByBranch } from "../controllers/inventoryController.js";
import { protect } from "../middlewares/authMiddleware.js"; // <-- 1. Impor 'protect'

const router = express.Router();

// 2. Terapkan 'protect' di rute ini
router.get("/:branch_id", protect, getInventoryByBranch);

export default router;
