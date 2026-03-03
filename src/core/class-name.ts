const PREFIX = 'rx';

export function className(block: string, element?: string, modifier?: string): string {
  let cls = `${PREFIX}-${block}`;
  if (element) cls += `_${element}`;
  if (modifier) cls += `-${modifier}`;
  return cls;
}
