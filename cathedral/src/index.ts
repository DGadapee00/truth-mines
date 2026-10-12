import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { CathedralApp } from './app';
import { DriverSystem } from './driver';

declare global {
  interface Window {
    __cathedral?: CathedralApp;
  }
}

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then(async (world) => {
  try {
    const app = await CathedralApp.create(world);
    (world.globals as Record<string, unknown>).cathedral = app;
    window.__cathedral = app;
    world.registerSystem(DriverSystem);
  } catch (e) {
    document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;inset:auto 16px 16px;background:#300;color:#fdd;padding:12px;border-radius:8px">The cathedral could not load its data. Run <code>python -m pipeline</code> and reload.</p>');
    console.error(e);
  }
});
