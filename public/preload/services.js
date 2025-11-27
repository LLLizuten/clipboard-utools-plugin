const fs = require('node:fs')
const path = require('node:path')
const { clipboard, nativeImage } = require('electron')

const EMPTY_PIXEL = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/3tVZ9sAAAAASUVORK5CYII='
)

// 通过 window 对象向渲染进程注入 nodejs 能力
window.services = {
  // 读文件
  readFile (file) {
    return fs.readFileSync(file, { encoding: 'utf-8' })
  },
  // 文本写入到下载目录
  writeTextFile (text) {
    const filePath = path.join(window.utools.getPath('downloads'), Date.now().toString() + '.txt')
    fs.writeFileSync(filePath, text, { encoding: 'utf-8' })
    return filePath
  },
  // 图片写入到下载目录
  writeImageFile (base64Url) {
    const matchs = /^data:image\/([a-z]{1,20});base64,/i.exec(base64Url)
    if (!matchs) return
    const filePath = path.join(window.utools.getPath('downloads'), Date.now().toString() + '.' + matchs[1])
    fs.writeFileSync(filePath, base64Url.substring(matchs[0].length), { encoding: 'base64' })
    return filePath
  },
  // 清空系统剪贴板（文本与图片）
  clearClipboard () {
    try {
      // 优先使用 uTools 官方 API 覆盖文本/图片
      if (global.utools?.copyText) global.utools.copyText(' ')
      if (global.utools?.copyImage) global.utools.copyImage(EMPTY_PIXEL.toDataURL())
      if (global.utools?.copyText) global.utools.copyText('')

      // 使用 electron clipboard 强制写入空文本与空图像
      clipboard.clear('clipboard')
      clipboard.clear('selection')
      clipboard.writeText(' ', 'clipboard')
      clipboard.writeImage(EMPTY_PIXEL, 'clipboard')
      clipboard.writeText(' ', 'selection')
      clipboard.writeImage(EMPTY_PIXEL, 'selection')
      clipboard.writeText('', 'clipboard')
      clipboard.writeText('', 'selection')
      clipboard.writeImage(EMPTY_PIXEL, 'clipboard')
      clipboard.writeImage(EMPTY_PIXEL, 'selection')

      // 验证
      const clearedText = clipboard.readText('clipboard')
      const clearedImage = clipboard.readImage('clipboard')
      const selectionText = clipboard.readText('selection')
      return (!clearedText || clearedText === ' ') && clearedImage.isEmpty() && (!selectionText || selectionText === ' ')
    } catch (err) {
      console.warn('clearClipboard failed', err)
      return false
    }
  },
  // 读取剪贴板（调试用）
  readClipboard () {
    try {
      const text = clipboard.readText('clipboard')
      const image = clipboard.readImage('clipboard')
      return { text, imageEmpty: image.isEmpty() }
    } catch (err) {
      console.warn('readClipboard failed', err)
      return { text: null, imageEmpty: null }
    }
  }
}
