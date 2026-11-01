// Save and pick files: web download / file input, Android share sheet / document picker (spec 8).
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export async function saveFile(name: string, content: Uint8Array | string, mime: string) {
  if (Platform.OS === 'web') {
    const blob = new Blob([content as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.create();
  await f.write(content);
  await Sharing.shareAsync(f.uri, { mimeType: mime, dialogTitle: name });
}

export async function pickTextFiles(): Promise<Record<string, string>> {
  const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: ['text/*', 'application/json', 'text/csv', '*/*'] });
  if (r.canceled) return {};
  const out: Record<string, string> = {};
  for (const a of r.assets) {
    out[a.name] = Platform.OS === 'web' && a.file ? await a.file.text() : await new File(a.uri).text();
  }
  return out;
}
