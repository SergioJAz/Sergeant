import type { FontId } from './appearance.ts';

export const FONTS: { id: FontId; label: string; regular?: string; bold?: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'rounded', label: 'Rounded', regular: 'Nunito_400Regular', bold: 'Nunito_700Bold' },
  { id: 'serif', label: 'Serif', regular: 'Lora_400Regular', bold: 'Lora_700Bold' },
  { id: 'mono', label: 'Mono', regular: 'JetBrainsMono_400Regular', bold: 'JetBrainsMono_700Bold' },
  { id: 'humanist', label: 'Humanist', regular: 'SourceSans3_400Regular', bold: 'SourceSans3_700Bold' },
  { id: 'comic', label: 'Comic Sans', regular: 'ComicNeue_400Regular', bold: 'ComicNeue_700Bold' },
  { id: 'impact', label: 'Impact', regular: 'Anton_400Regular' },
  { id: 'typewriter', label: 'Typewriter', regular: 'CourierPrime_400Regular', bold: 'CourierPrime_700Bold' },
  { id: 'wide', label: 'Wide', regular: 'Lexend_400Regular', bold: 'Lexend_700Bold' },
  { id: 'book', label: 'Book', regular: 'EBGaramond_400Regular', bold: 'EBGaramond_700Bold' },
  { id: 'handwritten', label: 'Handwritten', regular: 'Caveat_400Regular', bold: 'Caveat_700Bold' },
];

export function fontFamily(id: FontId, bold: boolean): string | undefined {
  const f = FONTS.find((x) => x.id === id);
  return (bold && f?.bold) || f?.regular;
}
