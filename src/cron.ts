import { DeleteRuleCommand, EventBridgeClient, PutRuleCommand, PutTargetsCommand, RemoveTargetsCommand } from '@aws-sdk/client-eventbridge'
import { AddPermissionCommand, RemovePermissionCommand, LambdaClient } from '@aws-sdk/client-lambda'

const eb = new EventBridgeClient({})
const lambda = new LambdaClient({})

// Parse // @cron <expr> from .zap source
export function parseCron(source: string): string | null {
  const match = source.match(/^\/\/\s*@cron\s+(.+)/m)
  return match ? match[1].trim() : null
}

// Convert standard 5-field cron to EventBridge format
// EventBridge requires one of day-of-month or day-of-week to be ?
function toSchedule(expr: string): string {
  const [min, hour, dom, month, dow] = expr.split(' ')
  const evbDom = dow !== '*' ? '?' : dom
  const evbDow = dow !== '*' ? dow : '?'
  return `cron(${min} ${hour} ${evbDom} ${month} ${evbDow} *)`
}

const ruleName = (name: string) => `zap-cron-${name.replace(/\//g, '-')}`
const statementId = (name: string) => `zap-cron-${name.replace(/\//g, '-')}`

export async function upsertCron(name: string, expr: string, functionArn: string): Promise<void> {
  const rule = ruleName(name)

  const { RuleArn } = await eb.send(new PutRuleCommand({
    Name: rule,
    ScheduleExpression: toSchedule(expr),
    State: 'ENABLED',
  }))

  await eb.send(new PutTargetsCommand({
    Rule: rule,
    Targets: [{ Id: 'zap', Arn: functionArn, Input: JSON.stringify({ zap: { cron: name } }) }],
  }))

  try {
    await lambda.send(new AddPermissionCommand({
      FunctionName: functionArn,
      StatementId: statementId(name),
      Action: 'lambda:InvokeFunction',
      Principal: 'events.amazonaws.com',
      SourceArn: RuleArn,
    }))
  } catch { /* permission already exists */ }
}

export async function removeCron(name: string, functionArn: string): Promise<void> {
  const rule = ruleName(name)
  try {
    await eb.send(new RemoveTargetsCommand({ Rule: rule, Ids: ['zap'] }))
    await eb.send(new DeleteRuleCommand({ Name: rule }))
    await lambda.send(new RemovePermissionCommand({ FunctionName: functionArn, StatementId: statementId(name) }))
  } catch { /* rule may not exist */ }
}
