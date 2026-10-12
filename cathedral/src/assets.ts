import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (filePath: string): string => `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

// The cathedral is built from pipeline descriptors, not authored models, so the only asset is the
// panel that carries Trurl's words in a headset. This module is evaluated by the runtime and the
// editor: pure, no World, no DOM.
export default defineAssets({
  'trurl-panel': {
    url: publicAssetUrl('ui/trurl.uikitml'),
    type: AssetType.UIKitML,
    name: 'Trurl panel',
  },
});
