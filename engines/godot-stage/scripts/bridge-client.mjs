#!/usr/bin/env node
/** Tiny TCP JSON-lines client for the Godot stage bridge. */
import net from 'node:net';

const port = Number(process.env.GODOT_BRIDGE_PORT || 8765);
const cmds = process.argv.slice(2);
if (!cmds.length) {
  console.log('Usage: node bridge-client.mjs \'{"cmd":"ping"}\' \'{"cmd":"status"}\'');
  process.exit(1);
}

const sock = net.connect({ host: '127.0.0.1', port }, () => {
  for (const c of cmds) sock.write(c.endsWith('\n') ? c : c + '\n');
});
sock.setEncoding('utf8');
let buf = '';
sock.on('data', (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (line.trim()) console.log(line);
  }
});
sock.on('error', (e) => {
  console.error(e.message);
  process.exit(1);
});
setTimeout(() => sock.end(), 1500);
