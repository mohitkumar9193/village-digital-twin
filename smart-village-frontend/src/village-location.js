import dataset from './data/kothri-osm.json';
export const villageDataset = dataset;
const [w,s,e,n] = dataset.bbox;
export const serviceExtent = {type:'Polygon',coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]};
export const mappedVillage = {name:dataset.name,boundary:serviceExtent};
export const referenceAssets = dataset.assets.map(a=>({...a,_id:a.id,condition:'unknown'}));
