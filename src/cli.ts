#!/usr/bin/env node
import { AddPermissionCommand, GetFunctionUrlConfigCommand, GetPolicyCommand, LambdaClient, RemovePermissionCommand, UpdateFunctionUrlConfigCommand } from '@aws-sdk/client-lambda'
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Command } from 'commander'
import { readFile, readdir, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseCron, upsertCron, removeCron } from './cron'

const s3 = new S3Client({})

function readConfig(): Record<string, string> {
  try { return JSON.parse(readFileSync('.zaprc', 'utf8')) } catch { return {} }
}

function bucket(opts: { bucket?: string }): string {
  const b = opts.bucket ?? process.env.ZAP_BUCKET ?? readConfig().bucket
  if (!b) {
    console.error('error: bucket required (--bucket, ZAP_BUCKET, or run: npm run init)')
    process.exit(1)
  }
  return b
}

async function walkZap(dir: string, prefix = ''): Promise<Array<{ filePath: string; key: string }>> {
  const entries = await readdir(dir, { withFileTypes: true })
  const results: Array<{ filePath: string; key: string }> = []
  for (const entry of entries) {
    const filePath = join(dir, entry.name)
    const key = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) results.push(...await walkZap(filePath, key))
    else if (entry.name.endsWith('.zap')) results.push({ filePath, key })
  }
  return results
}

async function deployFile(b: string, filePath: string, key: string): Promise<void> {
  const source = await readFile(filePath, 'utf8')
  await s3.send(new PutObjectCommand({ Bucket: b, Key: key, Body: source, ContentType: 'application/javascript' }))

  const name = key.replace(/\.zap$/, '')
  const cronExpr = parseCron(source)
  if (cronExpr) {
    const { functionArn } = readConfig()
    if (!functionArn) { console.error('run npm run init first'); process.exit(1) }
    await upsertCron(name, cronExpr, functionArn)
    console.log(`+ ${name}  ↻ ${cronExpr}`)
  } else {
    console.log(`+ ${name}`)
  }
}

const program = new Command()
  .name('zap')
  .description('Deploy .zap handlers to S3')
  .version('0.1.0')

program
  .command('init')
  .description('provision AWS infrastructure and deploy the runtime')
  .option('-r, --region <region>', 'AWS region', 'us-east-1')
  .action(async (opts) => {
    const { init } = await import('./init')
    await init(opts.region)
  })

program
  .command('deploy <path>')
  .description('upload a .zap file or directory to S3')
  .option('-b, --bucket <bucket>', 'S3 bucket (or set ZAP_BUCKET)')
  .action(async (path: string, opts) => {
    const b = bucket(opts)
    const info = await stat(path)
    if (info.isDirectory()) {
      const files = await walkZap(path)
      await Promise.all(files.map(({ filePath, key }) => deployFile(b, filePath, key)))
    } else {
      const key = path.replace(/^\.\//, '')
      await deployFile(b, path, key)
    }
  })

program
  .command('rm <name>')
  .description('remove a handler from S3')
  .option('-b, --bucket <bucket>', 'S3 bucket (or set ZAP_BUCKET)')
  .action(async (name: string, opts) => {
    const b = bucket(opts)
    const key = name.endsWith('.zap') ? name : `${name}.zap`
    await s3.send(new DeleteObjectCommand({ Bucket: b, Key: key }))
    const { functionArn } = readConfig()
    if (functionArn) await removeCron(name.replace(/\.zap$/, ''), functionArn)
    console.log(`- ${name.replace(/\.zap$/, '')}`)
  })

program
  .command('ls')
  .description('list deployed handlers')
  .option('-b, --bucket <bucket>', 'S3 bucket (or set ZAP_BUCKET)')
  .action(async (opts) => {
    const b = bucket(opts)
    const { Contents = [] } = await s3.send(new ListObjectsV2Command({ Bucket: b }))
    const handlers = Contents.filter(o => o.Key?.endsWith('.zap'))
    if (!handlers.length) return console.log('no handlers deployed')
    handlers.forEach(o => console.log(o.Key!.replace(/\.zap$/, '')))
  })

program
  .command('demo')
  .description('deploy the built-in demo handlers')
  .option('-b, --bucket <bucket>', 'S3 bucket (or set ZAP_BUCKET)')
  .action(async (opts) => {
    const b = bucket(opts)
    const demoDir = resolve(__dirname, '..', 'demo')
    const files = await walkZap(demoDir, 'demo')
    await Promise.all(files.map(({ filePath, key }) => deployFile(b, filePath, key)))
  })

program
  .command('debug')
  .description('show Lambda function URL auth config and resource-based policy')
  .action(async () => {
    const cfg = readConfig()
    const region = cfg.region ?? 'us-east-1'
    const fn = cfg.functionArn ?? cfg.function ?? 'zap-runtime'
    const lambda = new LambdaClient({ region })

    try {
      const { AuthType, FunctionUrl } = await lambda.send(new GetFunctionUrlConfigCommand({ FunctionName: fn }))
      console.log(`url:       ${FunctionUrl}`)
      console.log(`auth type: ${AuthType}`)
    } catch (err: any) { console.log('function url: not found -', err.message) }

    try {
      const { Policy } = await lambda.send(new GetPolicyCommand({ FunctionName: fn }))
      console.log('\nresource policy:')
      console.log(JSON.stringify(JSON.parse(Policy!), null, 2))
    } catch (err: any) { console.log('\nresource policy: none -', err.message) }
  })

program
  .command('repair')
  .description('re-apply Lambda Function URL public access permissions')
  .action(async () => {
    const cfg = readConfig()
    const region = cfg.region ?? 'us-east-1'
    const fn = cfg.functionArn ?? cfg.function ?? 'zap-runtime'
    const lambda = new LambdaClient({ region })
    await lambda.send(new UpdateFunctionUrlConfigCommand({ FunctionName: fn, AuthType: 'NONE', Cors: { AllowOrigins: ['*'], AllowMethods: ['*'], AllowHeaders: ['*'] } }))
    try { await lambda.send(new RemovePermissionCommand({ FunctionName: fn, StatementId: 'public-access' })) } catch {}
    await lambda.send(new AddPermissionCommand({ FunctionName: fn, StatementId: 'public-access', Action: 'lambda:InvokeFunctionUrl', Principal: '*', FunctionUrlAuthType: 'NONE' }))
    console.log('✓  permissions repaired')
    if (cfg.url) console.log(`\n  → ${cfg.url.trim()}\n`)
  })

program.parse()
