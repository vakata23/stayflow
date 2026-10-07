/**
 * Компресира снимка в браузъра преди качване — без библиотека, само Canvas.
 * Смалява до maxWidth (запазва пропорциите) и пренарежда като JPEG. Полезно
 * за галерия с много снимки от телефон (често 4000×3000+, няколко MB всяка).
 */
export async function compressImage(file, { maxWidth = 1920, quality = 0.82 } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('Файлът трябва да е изображение.')

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width)
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('Неуспешна компресия на снимката.')

  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], name, { type: 'image/jpeg' })
}
