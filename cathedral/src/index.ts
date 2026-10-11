import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { spike } from './spike';

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  console.log('spike', typeof spike, world !== undefined);
});
