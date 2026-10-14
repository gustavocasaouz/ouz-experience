// Leitor mínimo de .xlsx (somente leitura, sem dependências): lê o ZIP com zlib e o XML das planilhas.
// Retorna, para cada aba, as células com o valor em cache (v) e a fórmula (f), ambos como texto.
import { inflateRawSync } from "node:zlib";

function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("arquivo não é um .xlsx válido");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("índice do .xlsx corrompido");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    files.set(name, method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decode = (s) =>
  s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-fA-F]+);/g, (_, e) =>
    e === "lt" ? "<" : e === "gt" ? ">" : e === "quot" ? '"' : e === "apos" ? "'" : e === "amp" ? "&"
      : String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));
const texts = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");

/** @returns {{ name: string, cells: Map<string, { v: string | null, f: string | null }> }[]} */
export function readXlsx(buf) {
  const files = unzip(buf);
  const text = (n) => {
    const b = files.get(n);
    if (!b) throw new Error(`parte ausente no .xlsx: ${n}`);
    return b.toString("utf8");
  };
  const shared = files.has("xl/sharedStrings.xml")
    ? [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]))
    : [];
  const rels = new Map([...text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => [
    m[0].match(/Id="([^"]+)"/)[1], m[0].match(/Target="([^"]+)"/)[1].replace(/^\/?xl\//, "").replace(/^\//, ""),
  ]));
  return [...text("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const name = decode(m[0].match(/name="([^"]*)"/)[1]);
    const target = rels.get(m[0].match(/r:id="([^"]+)"/)[1]);
    const xml = text("xl/" + target);
    const cells = new Map();
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = c[1].match(/\br="([A-Z]+\d+)"/)?.[1];
      if (!ref || !c[2]) continue;
      const type = c[1].match(/\bt="([^"]+)"/)?.[1];
      const f = c[2].match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/)?.[1];
      let v = c[2].match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? null;
      if (type === "s" && v !== null) v = shared[Number(v)] ?? null;
      else if (type === "inlineStr") v = texts(c[2]);
      else if (v !== null) v = decode(v);
      cells.set(ref, { v, f: f ? decode(f) : null });
    }
    return { name, cells };
  });
}
