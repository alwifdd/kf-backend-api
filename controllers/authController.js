// controllers/authController.js
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { supabase } from "../config/supabaseClient.js";

/**
 * Fungsi ini untuk login kasir/admin/BM dari Web POS
 */
export const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username dan password harus diisi." });
  }

  try {
    // Ambil data user, DAN data relasi 'branches' jika ada
    const { data: user, error } = await supabase
      .from("users")
      .select(
        `
        *, 
        branches (
          branch_name,
          kota
        )
      `
      )
      .eq("username", username)
      .single();

    if (error || !user) {
      console.log("Login gagal: User tidak ditemukan atau query error.", error);
      return res.status(401).json({ message: "Username atau password salah." });
    }

    // 2. Bandingkan password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      console.log("Login gagal: Password tidak cocok.");
      return res.status(401).json({ message: "Username atau password salah." });
    }

    // 3. Buat payload token (termasuk 'area_kota')
    const payload = {
      userId: user.id,
      role: user.role,
      branchId: user.branch_id,
      area: user.area_kota,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "8h", // Token berlaku 8 jam
    });

    // 4. Tentukan 'branchName' secara dinamis berdasarkan role
    let branchName = "Super Admin"; // Default untuk superadmin

    if (user.role === "bisnis_manager") {
      // Jika Bisnis Manager, tampilkan nama areanya
      branchName = `Bisnis Manager - ${user.area_kota}`;
    } else if (user.branches) {
      // Jika Admin Cabang, tampilkan nama cabangnya
      branchName = `${user.branches.branch_name} - ${user.branches.kota}`;
    }

    // 5. Kirim respons sukses
    res.status(200).json({
      message: "Login berhasil!",
      token: token,
      user: {
        username: user.username,
        role: user.role,
        branchId: user.branch_id,
        area: user.area_kota,
        branchName: branchName, // Gunakan 'branchName' yang dinamis
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * Fungsi ini untuk Grab (tidak diubah)
 */
export const getAccessToken = (req, res) => {
  const { client_id, client_secret } = req.body;

  if (
    client_id !== process.env.GRAB_CLIENT_ID ||
    client_secret !== process.env.GRAB_CLIENT_SECRET
  ) {
    return res.status(401).json({
      error: "invalid_client",
      error_description: "Invalid client credentials.",
    });
  }

  try {
    const expiresIn = "7d";
    const token = jwt.sign(
      { issuer: "KimiaFarmaAPI" },
      process.env.JWT_SECRET,
      { expiresIn: expiresIn }
    );

    res.status(200).json({
      access_token: token,
      token_type: "Bearer",
      expires_in: 604800, // 7 hari dalam detik
    });
  } catch (error) {
    res.status(500).json({
      error: "server_error",
      error_description: "Could not generate token.",
    });
  }
};
