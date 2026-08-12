import 'dotenv/config'
import { spawn } from 'node:child_process'

const children = new Set()
let stdoutBuffer = ''
let servicesStarted = false
let stopping = false

function startChild(command, args, env = process.env) {
  const child = spawn(command, args, { env, stdio: 'inherit' })
  children.add(child)
  child.on('exit', (code, signal) => {
    children.delete(child)
    if (!stopping) {
      console.error(
        `${command} ${args.join(' ')} stopped${signal ? ` (${signal})` : ` with code ${code ?? 1}`}.`,
      )
      stopAll('SIGTERM', code ?? 1)
    }
  })
  return child
}

function stopAll(signal, exitCode = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (!child.killed) child.kill(signal)
  }
  setTimeout(() => process.exit(exitCode), 1_000).unref()
}

async function configureTelnyxWebhook(publicUrl) {
  const webhookUrl = `${publicUrl}/api/webhooks/telnyx`
  console.log(`Local site: ${publicUrl}`)
  console.log(`Telnyx webhook: ${webhookUrl}`)

  const apiKey = process.env.TELNYX_API_KEY?.trim()
  const profileId = process.env.TELNYX_MESSAGING_PROFILE_ID?.trim()

  if (!apiKey || !profileId) {
    console.warn(
      'Telnyx webhook was not updated. Set TELNYX_API_KEY and TELNYX_MESSAGING_PROFILE_ID in .env.',
    )
    return
  }

  try {
    const response = await fetch(
      `https://api.telnyx.com/v2/messaging_profiles/${encodeURIComponent(profileId)}`,
      {
        method: 'PATCH',
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhook_url: webhookUrl,
          webhook_api_version: '2',
        }),
      },
    )

    if (!response.ok) {
      const responseBody = await response.text()
      throw new Error(
        `Telnyx returned ${response.status}: ${responseBody || response.statusText}`,
      )
    }

    console.log('Telnyx Messaging Profile webhook updated for this dev run.')
  } catch (error) {
    console.error(
      'Could not update the Telnyx Messaging Profile webhook:',
      error instanceof Error ? error.message : error,
    )
  }
}

async function startServices(publicUrl) {
  if (servicesStarted) return
  servicesStarted = true

  await configureTelnyxWebhook(publicUrl)

  const env = { ...process.env, APP_BASE_URL: publicUrl }
  startChild('npm', ['run', 'dev'], env)
  startChild('npm', ['run', 'api:dev'], env)
}

function processNgrokLogLine(line) {
  if (!line.trim()) return

  try {
    const entry = JSON.parse(line)
    if (entry.url?.startsWith('https://')) {
      void startServices(entry.url)
    }
    if (entry.lvl === 'eror' || entry.lvl === 'error') {
      console.error(`ngrok: ${entry.msg}`)
    }
  } catch {
    console.log(`ngrok: ${line}`)
  }
}

const tunnel = spawn(
  'ngrok',
  ['http', '3000', '--log=stdout', '--log-format=json'],
  { stdio: ['inherit', 'pipe', 'pipe'] },
)
children.add(tunnel)

tunnel.stdout.on('data', (chunk) => {
  stdoutBuffer += chunk.toString()
  const lines = stdoutBuffer.split('\n')
  stdoutBuffer = lines.pop() ?? ''
  lines.forEach(processNgrokLogLine)
})

tunnel.stderr.on('data', (chunk) => {
  process.stderr.write(chunk)
})

tunnel.on('error', (error) => {
  console.error(`Unable to start ngrok: ${error.message}`)
  stopAll('SIGTERM', 1)
})

tunnel.on('exit', (code, signal) => {
  children.delete(tunnel)
  if (stdoutBuffer) processNgrokLogLine(stdoutBuffer)
  if (!stopping) {
    console.error(
      `ngrok stopped${signal ? ` (${signal})` : ` with code ${code ?? 1}`}.`,
    )
    stopAll('SIGTERM', code ?? 1)
  }
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stopAll(signal))
}
