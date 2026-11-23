// Web Worker (módulo) do modo estrutural. Recebe o PDF, devolve a versão otimizada e informa o progresso.
// Se uma importação falhar (rede/CDN), o Worker não inicia e a página recebe o evento "error".
import * as PDFLib from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js';
import { optimizeStructure, friendlyError } from './compress-core.js?v=1';

self.onmessage = async ({ data }) => {
  if (data?.type !== 'run') return;
  try {
    const result = await optimizeStructure(PDFLib, new Uint8Array(data.buffer), {
      onProgress: progress => self.postMessage({ type: 'progress', ...progress })
    });
    const bytes = result.bytes.byteOffset === 0 && result.bytes.byteLength === result.bytes.buffer.byteLength ? result.bytes : result.bytes.slice();
    self.postMessage({ type: 'done', bytes, stats: result.stats, pages: result.pages }, [bytes.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: friendlyError(err) });
  }
};

self.postMessage({ type: 'ready' });
