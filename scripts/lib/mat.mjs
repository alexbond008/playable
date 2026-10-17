// Minimal MATLAB v5 MAT-file reader (no dependencies): numeric arrays, char arrays, structs, cells,
// with zlib-compressed elements. Enough to pull lab data (e.g. RigData.mat) into a game's truth gate.
// Not supported: v7.3 (HDF5), sparse, objects, function handles.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const T = { INT8: 1, UINT8: 2, INT16: 3, UINT16: 4, INT32: 5, UINT32: 6, SINGLE: 7, DOUBLE: 9, INT64: 12, UINT64: 13, MATRIX: 14, COMPRESSED: 15, UTF8: 16, UTF16: 17, UTF32: 18 };
const CLASS = { CELL: 1, STRUCT: 2, OBJECT: 3, CHAR: 4, SPARSE: 5 };

function numbers(buf, type, le) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = [];
  const size = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 4, 6: 4, 7: 4, 9: 8, 12: 8, 13: 8, 16: 1, 17: 2, 18: 4 }[type];
  if (!size) return out;
  for (let o = 0; o + size <= buf.byteLength; o += size) {
    switch (type) {
      case T.INT8: out.push(dv.getInt8(o)); break;
      case T.UINT8: case T.UTF8: out.push(dv.getUint8(o)); break;
      case T.INT16: out.push(dv.getInt16(o, le)); break;
      case T.UINT16: case T.UTF16: out.push(dv.getUint16(o, le)); break;
      case T.INT32: out.push(dv.getInt32(o, le)); break;
      case T.UINT32: case T.UTF32: out.push(dv.getUint32(o, le)); break;
      case T.SINGLE: out.push(dv.getFloat32(o, le)); break;
      case T.DOUBLE: out.push(dv.getFloat64(o, le)); break;
      case T.INT64: out.push(Number(dv.getBigInt64(o, le))); break;
      case T.UINT64: out.push(Number(dv.getBigUint64(o, le))); break;
    }
  }
  return out;
}

// read one data element at `off`; returns { type, data (Buffer), next }
function element(buf, off, le) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const first = dv.getUint32(off, le);
  if (first >>> 16) {
    // small data element format: 2 bytes size, 2 bytes type, 4 bytes data
    const type = first & 0xffff;
    const n = first >>> 16;
    return { type, data: buf.subarray(off + 4, off + 4 + n), next: off + 8 };
  }
  const type = first;
  const n = dv.getUint32(off + 4, le);
  const data = buf.subarray(off + 8, off + 8 + n);
  const pad = type === T.COMPRESSED ? 0 : (8 - (n % 8)) % 8;
  return { type, data, next: off + 8 + n + pad };
}

function matrix(buf, le) {
  // buf is the content of a miMATRIX element
  let off = 0;
  const flags = element(buf, off, le); off = flags.next;
  const cls = numbers(flags.data, T.UINT32, le)[0] & 0xff;
  const dimsEl = element(buf, off, le); off = dimsEl.next;
  const dims = numbers(dimsEl.data, dimsEl.type, le);
  const nameEl = element(buf, off, le); off = nameEl.next;
  const name = Buffer.from(nameEl.data).toString("latin1");
  const count = dims.reduce((a, b) => a * b, 1);
  if (cls === CLASS.STRUCT) {
    const lenEl = element(buf, off, le); off = lenEl.next;
    const fieldLen = numbers(lenEl.data, T.INT32, le)[0];
    const namesEl = element(buf, off, le); off = namesEl.next;
    const fields = [];
    for (let i = 0; i < namesEl.data.length / fieldLen; i++) fields.push(Buffer.from(namesEl.data.subarray(i * fieldLen, (i + 1) * fieldLen)).toString("latin1").replace(/\0.*$/, ""));
    const items = [];
    for (let k = 0; k < count; k++) {
      const obj = {};
      for (const f of fields) {
        const el = element(buf, off, le); off = el.next;
        obj[f] = el.data.length ? matrix(el.data, le).value : [];
      }
      items.push(obj);
    }
    return { name, value: items.length === 1 ? items[0] : items, dims };
  }
  if (cls === CLASS.CELL) {
    const items = [];
    for (let k = 0; k < count; k++) {
      const el = element(buf, off, le); off = el.next;
      items.push(el.data.length ? matrix(el.data, le).value : []);
    }
    return { name, value: items, dims };
  }
  if (cls === CLASS.SPARSE || cls === CLASS.OBJECT) return { name, value: null, dims, unsupported: cls };
  const re = element(buf, off, le); off = re.next;
  const real = numbers(re.data, re.type, le);
  if (cls === CLASS.CHAR) return { name, value: String.fromCharCode(...real), dims };
  return { name, value: count === 1 ? real[0] : real, dims };
}

export function readMat(path) {
  const buf = readFileSync(path);
  const header = buf.subarray(0, 116).toString("latin1").trim();
  const le = buf.toString("latin1", 126, 128) === "IM";
  const vars = {};
  let off = 128;
  while (off + 8 <= buf.length) {
    let el = element(buf, off, le);
    off = el.next;
    let data = el.data;
    let type = el.type;
    if (type === T.COMPRESSED) {
      const raw = inflateSync(data);
      const inner = element(raw, 0, le);
      data = inner.data;
      type = inner.type;
    }
    if (type !== T.MATRIX) continue;
    const m = matrix(data, le);
    vars[m.name] = m.value;
  }
  return { header, vars };
}
