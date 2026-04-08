export type InkwiseDiffBlock = {
  type: 'equal' | 'insert' | 'delete'
  text: string
}

export function diffParagraphs(previousText: string, nextText: string): InkwiseDiffBlock[] {
  const before = splitParagraphs(previousText)
  const after = splitParagraphs(nextText)
  const lcs = buildLcsMatrix(before, after)

  const reversed: InkwiseDiffBlock[] = []
  let i = before.length
  let j = after.length

  while (i > 0 && j > 0) {
    if (before[i - 1] === after[j - 1]) {
      reversed.push({ type: 'equal', text: after[j - 1] })
      i -= 1
      j -= 1
      continue
    }
    if (lcs[i - 1][j] >= lcs[i][j - 1]) {
      reversed.push({ type: 'delete', text: before[i - 1] })
      i -= 1
    } else {
      reversed.push({ type: 'insert', text: after[j - 1] })
      j -= 1
    }
  }

  while (i > 0) {
    reversed.push({ type: 'delete', text: before[i - 1] })
    i -= 1
  }
  while (j > 0) {
    reversed.push({ type: 'insert', text: after[j - 1] })
    j -= 1
  }

  return mergeAdjacentBlocks(reversed.reverse())
}

function splitParagraphs(text: string): string[] {
  const normalized = (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!normalized) return []
  return normalized
    .split(/\n\s*\n+/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function buildLcsMatrix(before: string[], after: string[]): number[][] {
  const rows = before.length + 1
  const cols = after.length + 1
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0))
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (before[i - 1] === after[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1
      } else {
        matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1])
      }
    }
  }
  return matrix
}

function mergeAdjacentBlocks(blocks: InkwiseDiffBlock[]): InkwiseDiffBlock[] {
  const merged: InkwiseDiffBlock[] = []
  for (const block of blocks) {
    if (!block.text) continue
    const previous = merged[merged.length - 1]
    if (previous && previous.type === block.type) {
      previous.text = `${previous.text}\n\n${block.text}`.trim()
      continue
    }
    merged.push({ ...block })
  }
  return merged
}
