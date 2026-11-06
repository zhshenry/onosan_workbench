import './island-mascot.css';

export function IslandMascot({ moving = false }: { moving?: boolean }) {
  return <span className={`island-mascot ${moving ? 'can-blink' : ''}`} role="img" aria-label="圆环伙伴"><i /><i /></span>;
}
