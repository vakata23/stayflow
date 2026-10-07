/**
 * Компресира снимка в браузъра преди качване — без библиотека, само Canvas.
 *
 * Прекодирането през canvas пише НОВ файл само с пикселите: EXIF блокът
 * (вкл. GPS координатите, които телефоните записват) не се пренася. Това е
 * задължително за публичните снимки — иначе снимката издава точния адрес,
 * който на картата нарочно размазваме. createImageBitmap прилага EXIF
 * ориентацията преди това, така че изправените снимки остават изправени.
 */

const MAX_INPUT_BYTES = 25 * 1024 * 1024 // суров файл от телефон, преди компресия

async function encode(canvas, quality) {
  const webp = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
  // Safari (и някои други) не кодират WebP — toBlob тогава връща PNG; падаме на JPEG.
  if (webp && webp.type === 'image/webp') return webp
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

async function resize(bitmap, maxEdge, quality) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)

  const blob = await encode(canvas, quality)
  if (!blob) throw new Error('Неуспешна компресия на снимката.')
  return blob
}

function toFile(blob, baseName) {
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
  return new File([blob], `${baseName}.${ext}`, { type: blob.type })
}

export async function compressImage(file, { maxEdge = 1600, quality = 0.82 } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('Файлът трябва да е изображение.')
  if (file.size > MAX_INPUT_BYTES) throw new Error(`„${file.name}“ е твърде голям (максимум 25 MB).`)

  const bitmap = await createImageBitmap(file)
  try {
    const blob = await resize(bitmap, maxEdge, quality)
    return toFile(blob, file.name.replace(/\.[^.]+$/, ''))
  } finally {
    bitmap.close?.()
  }
}

/** Пълен размер (1600px) + миниатюра (768px) от едно декодиране — за галерията. */
export async function compressWithThumbnail(file) {
  if (!file.type.startsWith('image/')) throw new Error('Файлът трябва да е изображение.')
  if (file.size > MAX_INPUT_BYTES) throw new Error(`„${file.name}“ е твърде голям (максимум 25 MB).`)

  const bitmap = await createImageBitmap(file)
  try {
    const base = file.name.replace(/\.[^.]+$/, '')
    const [full, thumb] = await Promise.all([resize(bitmap, 1600, 0.82), resize(bitmap, 768, 0.75)])
    return { full: toFile(full, base), thumb: toFile(thumb, `${base}-thumb`) }
  } finally {
    bitmap.close?.()
  }
}
