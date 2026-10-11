import { defineAssets } from '@iwsdk/core';

// The cathedral is built from pipeline descriptors, not from authored assets: there is nothing to
// load. This module is evaluated by the runtime and the editor, so it stays empty and pure.
export default defineAssets({});
