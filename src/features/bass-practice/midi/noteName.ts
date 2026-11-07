export function noteName(n:number){return ["C","D♭","D","E♭","E","F","G♭","G","A♭","A","B♭","B"][n%12]+(Math.floor(n/12)-1);}
