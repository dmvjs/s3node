#!/usr/bin/env node
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Command } from 'commander'
import { readFile, readdir, stat } from 'node:fs/promises'
import { basename } from 'node:path'

const s3 = new S3Client({})

function bucket(opts: { bucket?: string }): string {
  const b = opts.bucket ?? process.env.ZAP_BUCKET
  if (!b) {
    console.error('error: bucket required (--bucket or ZAP_BUCKET)')
    process.exit(1)
  }
  return b
}

async function upload(bucket: string, filePath: string, key: string): Promise<void> {
  const body = await readFile(filePath)
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'application/javascript' }))
  console.log(`+ ${key.replace('.zap', '')}`)
}

const program = new Command()
  .name('zap')
  .description('Deploy .zap handlers to S3')
  .version('0.1.0')

program
  .command('deploy <path>')
  .description('upload a .zap file or directory to S3')
  .option('-b, --bucket <bucket>', 'S3 bucket (or set ZAP_BUCKET)')
  .action(async (path: string, opts) => {
    const b = bucket(opts)
    const info = await stat(path)
    if (info.isDirectory()) {
      const files = (await readdir(path)).filter(f => f.endsWith('.zap'))
      await Promise.all(files.map(f => upload(b, `${path}/${f}`, f)))
    } else {
      await upload(b, path, basename(path))
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
    console.log(`- ${name.replace('.zap', '')}`)
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
    handlers.forEach(o => console.log(o.Key!.replace('.zap', '')))
  })

program.parse()
