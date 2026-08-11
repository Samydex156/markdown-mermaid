import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'build')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c3aed"/>
      <stop offset="1" stop-color="#a855f7"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <rect x="96" y="120" width="140" height="96" rx="24" fill="#ffffff" opacity="0.95"/>
  <rect x="300" y="96" width="132" height="88" rx="20" fill="#ffffff" opacity="0.85"/>
  <path d="M96 352 L176 288 L256 352 L176 416 Z" fill="#ffffff" opacity="0.9"/>
  <rect x="300" y="320" width="132" height="88" rx="20" fill="#ffffff" opacity="0.8"/>
  <path d="M236 168 L300 140" stroke="#ffffff" stroke-width="14" fill="none" opacity="0.9"/>
  <path d="M256 352 L300 364" stroke="#ffffff" stroke-width="14" fill="none" opacity="0.9"/>
</svg>`

async function main() {
  await mkdir(outDir, { recursive: true })
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const buffers = []
  for (const size of sizes) {
    buffers.push(await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer())
  }
  const ico = await pngToIco(buffers)
  await writeFile(join(outDir, 'icon.ico'), ico)
  await writeFile(join(outDir, 'icon.png'), await sharp(Buffer.from(svg)).resize(512, 512).png().toBuffer())
  console.log('Icono generado: build/icon.ico y build/icon.png')
}

main().catch((error) => {
  console.error('Error generando el icono:', error)
  process.exit(1)
})
