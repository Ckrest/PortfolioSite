/** Private machine boundary for the shared browser/build connection resolver. */
import { resolveConnections } from '../js/connection-model.js';
try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (input.schema !== 'portfolio-site/connection-resolution-input@2') throw new Error('Unsupported connection resolution input');
  const result = resolveConnections(input.documents, input.connections, { scope: input.scope });
  console.log(JSON.stringify({ schema: 'portfolio-site/connection-resolution@2', ...result }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
