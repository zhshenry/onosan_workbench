// Geometry from docs/requirements/shared/ai-assistant/design/bot-avatar-system-2026-11-16.md, section 11.
export type CharacterPrimitive = ['circle', number, number, number] | ['rect', number, number, number, number, number] | ['path', string] | ['poly', string, number];
export interface CharacterArt { id: string; prims: CharacterPrimitive[]; core?: [number, number, number]; eye: ['default' | 'small', number]; hl: [number, number, number, number, number] }
type Ink = 'a' | 'b' | 'bg';
export type GraphicPart = ['ring', number, number, number, number, Ink] | ['circle', number, number, number, Ink] | ['rect', number, number, number, number, number, Ink, { gap: number }?] | ['path', string, Ink] | ['line', string, number, Ink] | ['poly', string, number, Ink];
export interface GraphicArt { id: string; offsetX?: number; parts: GraphicPart[] }
export const characterArt: CharacterArt[] = [
  {"id":"ring","prims":[["circle",50,50,43]],"core":[50,50,27],"eye":["small",50],"hl":[26,28,9,5,-42]},
  {"id":"orb","prims":[["circle",50,51,41]],"eye":["default",50],"hl":[34,30,12,7,-35]},
  {"id":"square","prims":[["path","M50 11C80.5 11 89 19.5 89 50C89 80.5 80.5 89 50 89C19.5 89 11 80.5 11 50C11 19.5 19.5 11 50 11Z"]],"eye":["default",50],"hl":[30,27,12,6.5,-35]},
  {"id":"drop","prims":[["path","M53.8 11.2C62.5 23.5 84 39.5 84 59A34 34 0 0 1 16 59C16 39.5 37.5 23.5 46.2 11.2Q50 5.8 53.8 11.2Z"]],"eye":["default",61],"hl":[32,48,8,5,-60]},
  {"id":"sail","prims":[["poly","50,15 87,81 13,81",12]],"eye":["default",61],"hl":[38.5,45,8,4,-61]},
  {"id":"hex","prims":[["poly","50,12 82.9,31 82.9,69 50,88 17.1,69 17.1,31",10]],"eye":["default",50],"hl":[31,31,10,5.5,-30]},
  {"id":"cloud","prims":[["circle",29,58,20],["circle",50,44,25],["circle",72,57,19],["rect",9,54,82,30,15]],"eye":["default",59],"hl":[41,30,10,5.5,-25]},
  {"id":"flower","prims":[["circle",50,25,17],["circle",71.65,37.5,17],["circle",71.65,62.5,17],["circle",50,75,17],["circle",28.35,62.5,17],["circle",28.35,37.5,17],["circle",50,50,28]],"eye":["default",50],"hl":[36,31,10,6,-35]},
  {"id":"ghost","prims":[["path","M14 46A36 36 0 0 1 86 46V80A12 12 0 0 1 62 80A12 12 0 0 1 38 80A12 12 0 0 1 14 80Z"]],"eye":["default",47],"hl":[31,28,11,6,-40]},
  {"id":"pill","prims":[["rect",8,21,84,58,29]],"eye":["default",50],"hl":[27,35,10,5.5,-25]},
  {"id":"star","prims":[["poly","50,14 62.05,37.42 88.04,41.64 69.5,60.33 73.51,86.36 50,74.5 26.49,86.36 30.5,60.33 11.96,41.64 37.95,37.42",10]],"eye":["small",55],"hl":[45,30,6,3.2,-68]},
  {"id":"bear","prims":[["circle",25,29,13],["circle",75,29,13],["circle",50,57,35]],"eye":["default",58],"hl":[35,42,10,6,-35]}
];
export const graphicPlate = "M50 0C88 0 100 12 100 50C100 88 88 100 50 100C12 100 0 88 0 50C0 12 12 0 50 0Z";
export const graphicArt: GraphicArt[] = [
  {"id":"orbit","parts":[["ring",50,50,19,9,"b"],["circle",63.4,36.6,8,"a"]]},
  {"id":"grid","parts":[["rect",28,28,19,19,6,"b"],["rect",53,28,19,19,6,"a"],["rect",28,53,19,19,6,"b"],["rect",53,53,19,19,6,"b"]]},
  {"id":"waves","parts":[["line","M28 41Q33.5 32 39 41T50 41T61 41T72 41",8,"a"],["line","M28 60Q33.5 51 39 60T50 60T61 60T72 60",8,"b"]]},
  {"id":"plus","parts":[["rect",25,40,50,20,6,"a"],["rect",40,25,20,50,6,"a"],["circle",50,50,5.5,"bg"]]},
  {"id":"sails","parts":[["poly","48.5,30 48.5,70 26.5,70",6,"a"],["poly","54.5,40 54.5,70 73.5,70",6,"b"]]},
  {"id":"half","parts":[["path","M50 27A23 23 0 0 0 50 73Z","a"],["path","M50 27A23 23 0 0 1 50 73Z","b"],["line","M50 24V76",4,"bg"]]},
  {"id":"gear","parts":[["circle",50,32,8.5,"a"],["circle",65.59,41,8.5,"a"],["circle",65.59,59,8.5,"a"],["circle",50,68,8.5,"a"],["circle",34.41,59,8.5,"a"],["circle",34.41,41,8.5,"a"],["circle",50,50,18,"a"],["circle",50,50,7,"bg"]]},
  {"id":"hexdot","parts":[["line","M50 29L68.2 39.5V60.5L50 71L31.8 60.5V39.5Z",8,"b"],["circle",50,50,6.5,"a"]]},
  {"id":"moon","offsetX":2,"parts":[["path","M48.63 28.06A22 22 0 1 0 67.13 58.88A18 18 0 1 1 48.63 28.06Z","a"],["circle",68,33,4.5,"b"]]},
  {"id":"stack","parts":[["rect",36,27,36,36,9,"b"],["rect",28,37,36,36,9,"a",{"gap":3.5}]]},
  {"id":"arch","parts":[["line","M33 69V48A17 17 0 0 1 67 48V69",10,"a"],["circle",50,59,5.5,"b"]]},
  {"id":"diamond","parts":[["poly","50,29 71,50 50,71 29,50",8,"b"],["poly","50,41 59,50 50,59 41,50",6,"a"]]}
];
