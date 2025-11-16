// routes/productRoutes.js
import express from "express";
import { getAllProducts } from "../controllers/productController.js";

const router = express.Router();

// Jika ada permintaan GET ke /api/products/, jalankan fungsi getAllProducts
router.get("/", getAllProducts);

export default router;
