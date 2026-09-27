import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { startDataAgent } from '../apps/agents/data-agent/src/index.js';
import { validateEnvelope, verifyContentHash } from '@vda/contracts';

async function runTest() {
  console.log('▶️ [TEST] Starting Data Agent on port 50051...');
  const agentServer = startDataAgent(50051);
  await agentServer.start();

  const protoPath = resolve(process.cwd(), 'proto/agent_pipeline.proto');
  const pkgDef = protoLoader.loadSync(protoPath, { keepCase: true, longs: String, enums: String, defaults: true });
  const proto = (grpc.loadPackageDefinition(pkgDef) as any).vda.agent.v1;
  const client = new proto.SubAgentService('localhost:50051', grpc.credentials.createInsecure());

  try {
    // 1. Test CheckHealth
    console.log('▶️ [TEST] Calling CheckHealth...');
    const healthRes = await new Promise<any>((res, rej) => {
      client.CheckHealth({}, (err: any, response: any) => (err ? rej(err) : res(response)));
    });
    assert.equal(healthRes.is_healthy, true, 'is_healthy must be true');
    console.log('✅ CheckHealth passed:', healthRes.status_message);

    // 2. Test ExecuteStep streaming
    console.log('▶️ [TEST] Calling ExecuteStep...');
    const events: any[] = [];
    await new Promise<void>((res, rej) => {
      const call = client.ExecuteStep({
        run_id: '11111111-1111-1111-1111-111111111111',
        task_id: 'task-data-test-01',
        session_id: 'session-01',
        user_prompt: 'Điều tra căn hộ bán chậm Sapphire',
        agent_role: 'data-agent',
        input_artifacts: [],
        execution_context_json: '{}',
      });
      call.on('data', (evt: any) => events.push(evt));
      call.on('error', (err: any) => rej(err));
      call.on('end', () => res());
    });

    console.log(`✅ Received ${events.length} stream events.`);
    const traceEvents = events.filter((e) => e.type === 'TRACE');
    const completeEvents = events.filter((e) => e.type === 'COMPLETE');

    assert.ok(traceEvents.length >= 3, 'Must emit at least 3 TRACE events');
    assert.equal(completeEvents.length, 1, 'Must emit exactly 1 COMPLETE event');

    const complete = completeEvents[0];
    const envelope = JSON.parse(complete.output_artifact_json);
    validateEnvelope(envelope);
    assert.equal(verifyContentHash(envelope), true, 'content_hash must match canonical SHA-256');
    assert.equal(envelope.artifact_type, 'dataset');
    assert.ok(envelope.payload.units.length >= 3, 'Must return at least 3 slow-moving units');
    assert.ok(envelope.evidence_refs.includes('UNIT-VH-01'), 'Must cite UNIT-VH-01');
    console.log('🎉 All assertions passed! Data Agent and Base Server are 100% verified.');
  } finally {
    client.close();
    await agentServer.stop();
  }
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
