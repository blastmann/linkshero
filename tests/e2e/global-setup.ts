import { execSync } from 'node:child_process'

export default async function globalSetup() {
  // Build once for all e2e tests to avoid Windows file locks from concurrent builds.
  execSync('npm run build', { stdio: 'inherit' })
}

