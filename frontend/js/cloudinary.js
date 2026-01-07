const Cloudinary = {
  /**
   * Génère une URL Cloudinary optimisée
   *
   * @param {string} url - URL stockée en DB
   * @param {object} opts
   */
  img(url, opts = {}) {
    if (!url || !url.includes('/upload/')) return url;

    const {
      width,
      height,
      crop = 'fill',
      gravity = 'auto'
    } = opts;

    const parts = [];

    if (width) parts.push(`w_${width}`);
    if (height) parts.push(`h_${height}`);
    if (crop) parts.push(`c_${crop}`);
    if (gravity) parts.push(`g_${gravity}`);

    parts.push('f_auto');
    parts.push('q_auto');

    return url.replace(
      '/upload/',
      `/upload/${parts.join(',')}/`
    );
  }
};
window.CloudinaryUpload = async function uploadImage(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', 'dynamite_unsigned');

  const res = await fetch(
    'https://api.cloudinary.com/v1_1/dmbiuie1c/image/upload',
    {
      method: 'POST',
      body: formData
    }
  );

  if (!res.ok) {
    throw new Error('Upload Cloudinary échoué');
  }

  const data = await res.json();
  return data.secure_url;
};

