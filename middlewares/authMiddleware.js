// middlewares/authMiddleware.js
import jwt from "jsonwebtoken";

export const protect = (req, res, next) => {
  let token;

  // 1. Cek apakah ada token di header Authorization
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // 2. Ambil token dari header (setelah kata "Bearer ")
      token = req.headers.authorization.split(" ")[1];

      // 3. Verifikasi DAN decode token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // --- INI PERUBAHANNYA ---
      // 4. Simpan data user (termasuk 'area') dari token ke req.user
      req.user = {
        userId: decoded.userId,
        role: decoded.role,
        branchId: decoded.branchId,
        area: decoded.area, // <-- Ini baris yang kita tambahkan
      };
      // -------------------------

      // 5. Lanjut ke controller berikutnya
      next();
    } catch (error) {
      return res
        .status(401)
        .json({ status: "fail", message: "Not authorized, token failed" });
    }
  }

  // 6. Jika tidak ada token sama sekali
  if (!token) {
    return res
      .status(401)
      .json({ status: "fail", message: "Not authorized, no token" });
  }
};
