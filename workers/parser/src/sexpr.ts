/** Shared KiCad s-expression helpers. */

export function extractQuoted(block: string, key: string): string | undefined {
  const re = new RegExp(`\\(${key}\\s+"([^"]*)"\\)`);
  const m = block.match(re);
  return m?.[1];
}

/** KiCad 6 often uses bare tokens: `(uuid abc-…)`; KiCad 7+ quotes them. */
export function extractUuid(block: string): string | undefined {
  const quoted = extractQuoted(block, "uuid");
  if (quoted) return quoted;
  const bare = block.match(
    /\(uuid\s+([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)/,
  );
  return bare?.[1];
}

export function extractProperty(block: string, name: string): string | undefined {
  const re = new RegExp(`\\(property\\s+"${name}"\\s+"([^"]*)"`, "i");
  const m = block.match(re);
  return m?.[1];
}

export function extractBlocks(src: string, tag: string): string[] {
  const needle = `(${tag}`;
  const blocks: string[] = [];
  let i = 0;
  while (i < src.length) {
    const start = src.indexOf(needle, i);
    if (start < 0) break;
    const after = src[start + needle.length];
    if (
      after &&
      after !== " " &&
      after !== "\n" &&
      after !== "\r" &&
      after !== "\t" &&
      after !== '"'
    ) {
      i = start + 1;
      continue;
    }
    let depth = 0;
    let j = start;
    for (; j < src.length; j++) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    blocks.push(src.slice(start, j));
    i = j;
  }
  return blocks;
}

export function extractSymbolInstanceBlocks(src: string): string[] {
  const blocks: string[] = [];
  for (const block of extractBlocks(src, "symbol")) {
    if (!block.includes("(lib_id")) continue;
    // Skip embedded library definitions: `(symbol "Lib:Part" …)`
    if (/^\(symbol\s+"/.test(block.trim())) continue;
    if (
      block.includes('(property "Reference"') ||
      /\(property\s+"Reference"\s+"/i.test(block)
    ) {
      blocks.push(block);
    }
  }
  return blocks;
}
