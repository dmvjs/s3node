import {
  AttachRolePolicyCommand, CreateRoleCommand, GetRoleCommand,
  IAMClient, PutRolePolicyCommand,
} from '@aws-sdk/client-iam'
import {
  AddPermissionCommand, CreateFunctionCommand, CreateFunctionUrlConfigCommand,
  GetFunctionCommand, GetFunctionUrlConfigCommand, LambdaClient,
  UpdateFunctionCodeCommand, UpdateFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda'
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { CreateTableCommand, DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const ROLE = 'zap-runtime-role'
const FUNCTION = 'zap-runtime'
const TABLE = 'zap-kv'

const TRUST = JSON.stringify({
  Version: '2012-10-17',
  Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }],
})

const policy = (bucket: string) => JSON.stringify({
  Version: '2012-10-17',
  Statement: [
    { Effect: 'Allow', Action: ['s3:GetObject', 's3:ListBucket'], Resource: [`arn:aws:s3:::${bucket}`, `arn:aws:s3:::${bucket}/*`] },
    { Effect: 'Allow', Action: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:DeleteItem'], Resource: `arn:aws:dynamodb:*:*:table/${TABLE}` },
  ],
})

function step(label: string) {
  process.stdout.write(`  ${label.padEnd(24)}`)
  return (note = '') => console.log(`✓${note ? '  ' + note : ''}`)
}

export async function init(region: string) {
  const s3 = new S3Client({ region })
  const iam = new IAMClient({ region: 'us-east-1' })
  const lambda = new LambdaClient({ region })
  const dynamo = new DynamoDBClient({ region })

  let config: Record<string, string> = {}
  try { config = JSON.parse(readFileSync('.zaprc', 'utf8')) } catch {}

  // Build
  let done = step('building runtime')
  execSync('npx tsc', { stdio: 'pipe' })
  execSync('zip -j dist/runtime.zip dist/handler.js dist/eval.js dist/types.js dist/kv.js', { stdio: 'pipe' })
  done()

  // Bucket
  const bucket = config.bucket ?? `zap-${randomBytes(4).toString('hex')}`
  done = step('creating bucket')
  try { await s3.send(new HeadBucketCommand({ Bucket: bucket })) } catch {
    await s3.send(new CreateBucketCommand({
      Bucket: bucket,
      ...(region !== 'us-east-1' && { CreateBucketConfiguration: { LocationConstraint: region as any } }),
    }))
  }
  done(bucket)

  // KV table
  done = step('creating kv table')
  try { await dynamo.send(new DescribeTableCommand({ TableName: TABLE })) } catch {
    await dynamo.send(new CreateTableCommand({
      TableName: TABLE,
      KeySchema: [{ AttributeName: 'k', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'k', AttributeType: 'S' }],
      BillingMode: 'PAY_PER_REQUEST',
    }))
  }
  done(TABLE)

  // IAM role
  done = step('configuring iam')
  let roleArn: string
  let isNew = false
  try {
    const { Role } = await iam.send(new GetRoleCommand({ RoleName: ROLE }))
    roleArn = Role!.Arn!
    await iam.send(new PutRolePolicyCommand({ RoleName: ROLE, PolicyName: 'zap-access', PolicyDocument: policy(bucket) }))
  } catch {
    isNew = true
    const { Role } = await iam.send(new CreateRoleCommand({ RoleName: ROLE, AssumeRolePolicyDocument: TRUST }))
    roleArn = Role!.Arn!
    await iam.send(new AttachRolePolicyCommand({ RoleName: ROLE, PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole' }))
    await iam.send(new PutRolePolicyCommand({ RoleName: ROLE, PolicyName: 'zap-access', PolicyDocument: policy(bucket) }))
  }
  if (isNew) {
    process.stdout.write('propagating...')
    await new Promise(r => setTimeout(r, 10_000))
    process.stdout.write('\r  configuring iam        ')
  }
  done()

  // Lambda
  done = step('deploying lambda')
  const zip = readFileSync('dist/runtime.zip')
  const env = { ZAP_BUCKET: bucket, ZAP_TABLE: TABLE }
  try {
    await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION }))
    await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: FUNCTION, ZipFile: zip }))
    await lambda.send(new UpdateFunctionConfigurationCommand({ FunctionName: FUNCTION, Environment: { Variables: env } }))
  } catch {
    await lambda.send(new CreateFunctionCommand({
      FunctionName: FUNCTION,
      Runtime: 'nodejs20.x',
      Role: roleArn,
      Handler: 'handler.handler',
      Code: { ZipFile: zip },
      Environment: { Variables: env },
      Timeout: 30,
      MemorySize: 256,
    }))
  }
  done()

  // Function URL
  done = step('creating endpoint')
  let url: string
  try {
    const { FunctionUrl } = await lambda.send(new GetFunctionUrlConfigCommand({ FunctionName: FUNCTION }))
    url = FunctionUrl!
  } catch {
    const { FunctionUrl } = await lambda.send(new CreateFunctionUrlConfigCommand({
      FunctionName: FUNCTION,
      AuthType: 'NONE',
      Cors: { AllowOrigins: ['*'], AllowMethods: ['*'], AllowHeaders: ['*'] },
    }))
    await lambda.send(new AddPermissionCommand({
      FunctionName: FUNCTION,
      StatementId: 'public-access',
      Action: 'lambda:InvokeFunctionUrl',
      Principal: '*',
      FunctionUrlAuthType: 'NONE',
    }))
    url = FunctionUrl!
  }
  done()

  writeFileSync('.zaprc', JSON.stringify({ bucket, function: FUNCTION, table: TABLE, region, url }, null, 2))
  console.log(`\n  → ${url.trim()}\n`)
}
