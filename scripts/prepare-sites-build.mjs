import { copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
await mkdir(resolve(root, 'dist/server'), { recursive: true })
await copyFile(resolve(root, 'worker/index.js'), resolve(root, 'dist/server/index.js'))
