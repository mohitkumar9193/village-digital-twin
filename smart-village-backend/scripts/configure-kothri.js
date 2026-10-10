import { readFile } from 'node:fs/promises';
import { Village } from '../src/models.js';
export async function configureKothriVillage(villageId) {
  const data = JSON.parse(await readFile(new URL('../../smart-village-frontend/src/data/kothri-osm.json', import.meta.url),'utf8'));
  const [w,s,e,n] = data.bbox;
  // An application service extent, not a surveyed administrative boundary.
  await Village.updateOne({_id:villageId},{$set:{name:data.name,boundary:{type:'Polygon',coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]}}});
}
