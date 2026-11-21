import { formatPartFileName, parsePartSequence } from './constants';
import { pairByteLength } from './qa-pairs';

export interface PairWriteUnit {
  text: string;
  messageCount: number;
}

export interface FileAppendPlan {
  fileName: string;
  appendText: string;
  createNewFile: boolean;
}

/**
 * Mandatory split invariants:
 * - Each `unit` is one complete Q/A pair (or Q-only / A-only orphan); never split inside a unit.
 * - Split only between units. New files start with `newFileHeader` + first full unit.
 * - If one unit exceeds maxFileBytes, append it anyway (file may exceed the cap).
 */
export function splitPairUnitsAcrossFiles(params: {
  units: PairWriteUnit[];
  activeFileName: string;
  activeFileBytes: number;
  maxFileBytes: number;
  newFileHeader: string;
  activeFileIsEmpty: boolean;
}): FileAppendPlan[] {
  const {
    units,
    activeFileName,
    activeFileBytes,
    maxFileBytes,
    newFileHeader,
    activeFileIsEmpty,
  } = params;

  if (units.length === 0) return [];

  const plans: FileAppendPlan[] = [];
  let fileName = activeFileName;
  let fileBytes = activeFileBytes;
  let seq = parsePartSequence(fileName) ?? 1;

  for (const unit of units) {
    const unitBytes = pairByteLength(unit.text);
    const allowExceed = unitBytes > maxFileBytes;

    if (!allowExceed && fileBytes > 0 && fileBytes + unitBytes > maxFileBytes) {
      seq += 1;
      fileName = formatPartFileName(seq);
      fileBytes = 0;
    }

    if (fileBytes === 0) {
      const isNewPart = fileName !== activeFileName || activeFileIsEmpty;
      const prefix = isNewPart ? newFileHeader : '';
      const appendText = prefix + unit.text;
      plans.push({
        fileName,
        appendText,
        createNewFile: isNewPart,
      });
      fileBytes = pairByteLength(appendText);
      continue;
    }

    plans.push({
      fileName,
      appendText: unit.text,
      createNewFile: false,
    });
    fileBytes += unitBytes;
  }

  return plans;
}