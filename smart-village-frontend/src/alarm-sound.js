// Soft major-pentatonic bell pattern, repeated with quiet gaps.
export function alarmNotes(duration=30){
 const melody=[523.25,659.25,783.99,1046.5,783.99,659.25];
 const notes=[];
 for(let phrase=0;phrase<duration;phrase+=5)for(let i=0;i<melody.length;i++){
  const offset=phrase+i*.48;
  if(offset<duration)notes.push({frequency:melody[i],offset,length:Math.min(.85,duration-offset)});
 }
 return notes;
}
export const alarmDuration=30;
