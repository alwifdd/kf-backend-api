// routes/menuRoutes.js
import express from "express";
import {
  getMartMenu,
  updateSingleItem,
  batchUpdateItems, // <-- Tambah import
} from "../controllers/menuController.js";

const router = express.Router();

// ==============================
// ROUTES MENU UNTUK GRAB INTEGRATION
// ==============================

// 1️⃣ Get mart menu (untuk webhook atau testing ambil data menu)
router.get("/", getMartMenu);

// 2️⃣ Update satu item menu dari POS kita
router.put("/items/:itemId", updateSingleItem);

// 3️⃣ Batch update banyak item sekaligus
router.put("/items/batch-update", batchUpdateItems);

export default router;
