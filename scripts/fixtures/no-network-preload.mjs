// Loaded with `node --import` by offline tests: any attempt to open a socket or
// resolve a name throws. A test that passes under this connected to nothing.
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";

const blocked = (what) => () => { throw new Error(`NETWORK BLOCKED (${what}) by scripts/fixtures/no-network-preload.mjs`); };
net.Socket.prototype.connect = blocked("net.Socket.connect");
net.connect = net.createConnection = blocked("net.connect");
tls.connect = blocked("tls.connect");
dns.lookup = blocked("dns.lookup");
dns.promises.lookup = blocked("dns.promises.lookup");
globalThis.fetch = blocked("fetch");
