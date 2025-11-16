// routes/authRoutes.js
import express from "express";
import { getAccessToken, login } from "../controllers/authController.js"; // <-- Impor 'login'

const router = express.Router();

// Endpoint untuk Grab mendapatkan token (tidak berubah)
router.post("/token", getAccessToken);

// Endpoint BARU untuk kasir/admin login
router.post("/login", login);

export default router;
