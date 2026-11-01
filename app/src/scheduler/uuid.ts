// RFC 4122 uuid v5 (SHA-1, name-based) in plain TS so scheduler ids are deterministic without deps (Contracts 9, AC13).

function sha1(bytes: Uint8Array): Uint8Array {
  const n = bytes.length;
  const words = new Uint32Array((((n + 8) >> 6) + 1) * 16);
  for (let i = 0; i < n; i++) words[i >> 2] |= bytes[i] << (24 - (i & 3) * 8);
  words[n >> 2] |= 0x80 << (24 - (n & 3) * 8);
  words[words.length - 1] = n * 8;
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  for (let off = 0; off < words.length; off += 16) {
    for (let i = 0; i < 16; i++) w[i] = words[off + i];
    for (let i = 16; i < 80; i++) {
      const v = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (v << 1) | (v >>> 31);
    }
    let [a, b, c, d, e] = h;
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (b & c) | (~b & d) : i < 40 ? b ^ c ^ d : i < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = t;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
  }
  const out = new Uint8Array(20);
  h.forEach((v, i) => {
    out[i * 4] = v >>> 24;
    out[i * 4 + 1] = v >>> 16;
    out[i * 4 + 2] = v >>> 8;
    out[i * 4 + 3] = v;
  });
  return out;
}

export function uuidv5(name: string, namespace: string): string {
  const ns = namespace.replace(/-/g, '').match(/../g)!.map((x) => parseInt(x, 16));
  const nameBytes = new TextEncoder().encode(name);
  const buf = new Uint8Array(16 + nameBytes.length);
  buf.set(ns);
  buf.set(nameBytes, 16);
  const b = sha1(buf).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
