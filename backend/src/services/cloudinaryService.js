const cloudinary = require('cloudinary').v2;
const { env } = require('../utils/env');

const isConfigured = () => env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET;

if (isConfigured()) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET
  });
}

module.exports = {
  async deleteByUrl(imageUrl) {
    if (!imageUrl) return;
    if (!isConfigured()) return;

    try {
      // Attempt to extract public_id: best effort
      const url = new URL(imageUrl);
      const parts = url.pathname.split('/').filter(Boolean);
      const filename = parts[parts.length - 1] || '';
      const publicIdNoExt = filename.split('.')[0];
      const publicId = `${env.CLOUDINARY_FOLDER}/${publicIdNoExt}`;
      await cloudinary.uploader.destroy(publicId);
    } catch (_) {
      // non-bloquant
    }
  }
};
