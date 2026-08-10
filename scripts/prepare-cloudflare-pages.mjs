import { cp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { build } from 'esbuild'

const pagesProviderNames = new Set(['cloudflare-pages', 'cloudflare_pages'])
const isCloudflarePages = process.env.CF_PAGES === '1' || pagesProviderNames.has(process.env.SERVER_ADAPTER || '')

if (!isCloudflarePages) {
  process.exit(0)
}

const root = process.cwd()
const distDir = join(root, 'dist')
const clientDir = join(distDir, 'client')
const serverEntry = join(distDir, 'server', 'entry.mjs')
const workerPath = join(distDir, '_worker.js')
const clientWorkerPath = join(clientDir, '_worker.js')
const shimDir = join(distDir, '.pages-shims')

await cp(clientDir, distDir, { recursive: true, force: true })
await mkdir(shimDir, { recursive: true })
await writeFile(join(shimDir, 'empty.js'), 'export default {};\n')
await writeFile(
  join(shimDir, 'url.js'),
  'export function fileURLToPath(){ return "" }\nexport function pathToFileURL(){ return new URL("file:///") }\nexport default { fileURLToPath, pathToFileURL }\n',
)
await writeFile(
  join(shimDir, 'path.js'),
  [
    'export function dirname(){ return "" }',
    'export function join(...p){ return p.filter(Boolean).join("/") }',
    'export function resolve(...p){ return p.filter(Boolean).join("/") }',
    'export function basename(p){ return String(p).split("/").pop() || "" }',
    'export function extname(p){ const b=basename(p); const i=b.lastIndexOf("."); return i>=0?b.slice(i):"" }',
    'export default { dirname, join, resolve, basename, extname }',
    '',
  ].join('\n'),
)

await build({
  entryPoints: [serverEntry],
  outfile: workerPath,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  external: ['cloudflare:workers'],
  alias: {
    fs: join(shimDir, 'empty.js'),
    path: join(shimDir, 'path.js'),
    url: join(shimDir, 'url.js'),
  },
})

await cp(workerPath, clientWorkerPath, { force: true })
