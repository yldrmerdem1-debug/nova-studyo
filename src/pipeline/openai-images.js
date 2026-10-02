const API_ROOT = 'https://api.openai.com/v1/images';

function stopIfCancelled(settings) {
  if (settings?.__cancel?.() || settings?.__signal?.aborted) throw new Error('cancelled');
}

function imageSize(settings = {}) {
  const width = Number(settings.kanvasW) || 1920;
  const height = Number(settings.kanvasH) || 1080;
  if (Math.abs(width / height - 1) < .1) return '1024x1024';
  if (height > width) return '864x1536';
  if (width / height >= 1.7) return '1536x864';
  return '1536x1024';
}

function dataUrlToBlob(value) {
  const match = /^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i.exec(value || '');
  if (!match) return null;
  return new Blob([Buffer.from(match[2], 'base64')], { type: match[1] });
}

async function referenceBlob(reference, transport, signal) {
  const inline = dataUrlToBlob(reference);
  if (inline) return inline;
  const response = await transport(reference, { signal });
  if (!response.ok) throw new Error(`OpenAI referans görseli HTTP ${response.status}`);
  return response.blob();
}

async function resultDataUrl(response) {
  if (!response.ok) throw new Error(`OpenAI Images HTTP ${response.status}`);
  let body;
  try { body = await response.json(); } catch { throw new Error('OpenAI Images geçersiz yanıt'); }
  const encoded = body?.data?.[0]?.b64_json;
  if (typeof encoded !== 'string' || !encoded) throw new Error('OpenAI Images: görsel verisi yok');
  return `data:image/jpeg;base64,${encoded}`;
}

export function createOpenAIImagesProvider(transport = (...args) => fetch(...args)) {
  const request = async (path, init, settings) => {
    stopIfCancelled(settings);
    const response = await transport(`${API_ROOT}/${path}`, { ...init, signal: settings?.__signal });
    return resultDataUrl(response);
  };

  return {
    name: 'OpenAI',
    imageOnly: true,
    async textToImage(prompt, settings = {}) {
      if (!settings.openaiKey) throw new Error("OpenAI API anahtarı yok — Ayarlar'dan ekleyin veya Dry-run kullanın.");
      return request('generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.openaiImageModel || 'gpt-image-2', prompt,
          quality: 'high', output_format: 'jpeg', size: imageSize(settings), n: 1,
        }),
      }, settings);
    },
    async imageToImage(prompt, anchor, settings = {}) {
      if (!settings.openaiKey) throw new Error("OpenAI API anahtarı yok — Ayarlar'dan ekleyin veya Dry-run kullanın.");
      stopIfCancelled(settings);
      const image = await referenceBlob(anchor, transport, settings.__signal);
      stopIfCancelled(settings);
      const form = new FormData();
      form.append('model', settings.openaiImageModel || 'gpt-image-2');
      form.append('prompt', prompt);
      form.append('quality', 'high');
      form.append('output_format', 'jpeg');
      form.append('size', imageSize(settings));
      form.append('image[]', image, 'reference.jpg');
      return request('edits', {
        method: 'POST', headers: { Authorization: `Bearer ${settings.openaiKey}` }, body: form,
      }, settings);
    },
  };
}

export const openAIImagesProvider = createOpenAIImagesProvider();
