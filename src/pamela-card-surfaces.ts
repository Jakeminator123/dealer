/** Source-bound visible-card repair, not a 3D card or amodal hand reconstruction. */
export const PAMELA_CARD_SOURCE_SHA256='2445bb2ef5122fe558134d582533d277603da72c4b98b6c782be01a5bf06235a';
export type PamelaCardSide='BACK'|'FRONT'|'UNKNOWN';
export function pamelaCardSide(sourceFrameIndex:number,visible=true){
  if(!Number.isInteger(sourceFrameIndex)||sourceFrameIndex<0||sourceFrameIndex>=180)throw Error('Invalid Pamela source frame');
  let side:PamelaCardSide='UNKNOWN',reason='No separately observed moving-card surface';
  if(visible&&sourceFrameIndex>=36&&sourceFrameIndex<=53){side='BACK';reason='Authored side assignment: shoe extraction before observed turn; source prop is unprinted.';}
  else if(visible&&sourceFrameIndex>=54&&sourceFrameIndex<=73)reason='Near-edge-on/grip-occluded hand transfer; no front/back print is inferred.';
  else if(visible&&sourceFrameIndex>=74&&sourceFrameIndex<=78){side='BACK';reason='Authored side assignment: visible green-lit underside before final face-up presentation; source has no printed side identifier.';}
  else if(visible&&sourceFrameIndex===79)reason='Turn/bend transition: preserve observed surface, side uncertain.';
  else if(visible&&sourceFrameIndex>=80){side='FRONT';reason='Authored side assignment: exposed surface continuing into face-up landing.';}
  return {sourceFrameIndex,timeSeconds:sourceFrameIndex/30,side,reason,semantics:'Side labels are an explicit presentation contract inferred from observed handling plus the requested face-down extraction. Blank source pixels do not prove a printed side identity.'};
}
export function preparePamelaCardSurface(input:{sourceRGB:Buffer;visibleMask:Buffer;width:number;height:number;sourceFrameIndex:number;sourceSha256:string}){
  const {sourceRGB:raw,visibleMask:mask,width:W,height:H}=input;
  if(W!==1762||H!==1174||raw.length!==W*H*3||mask.length!==W*H||input.sourceSha256!==PAMELA_CARD_SOURCE_SHA256)throw Error('Card surface source binding mismatch');
  const support=new Uint8Array(W*H),paintMask=Buffer.alloc(W*H),coverage=new Float32Array(W*H);
  let observedPixels=0,skinExcludedPixels=0,opaqueCorePixels=0;
  for(let p=0;p<support.length;p++)if(mask[p]){
    const i=p*3,r=raw[i],g=raw[i+1],b=raw[i+2];
    const skin=r>95&&r>g*1.12&&g>b*1.07;
    if(skin){skinExcludedPixels++;continue;}
    support[p]=1;observedPixels++;
  }
  // The old mask stores colour confidence, not optical opacity. Make only its
  // observed, one-pixel-eroded interior opaque. Never fill holes or grow support.
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    const p=y*W+x;if(!support[p])continue;
    const interior=support[p-1]&&support[p+1]&&support[p-W]&&support[p+W];
    const a=interior?1:mask[p]/255;
    coverage[p]=a;paintMask[p]=Math.round(a*255);if(interior)opaqueCorePixels++;
  }
  return {coverage,paintMask,side:pamelaCardSide(input.sourceFrameIndex,observedPixels>0),diagnostics:{observedPixels,skinExcludedPixels,opaqueCorePixels,supportExpansionPixels:0,opacityPolicy:'Opaque only inside the one-pixel-eroded observed support; boundary keeps measured colour-confidence weight. No dilation, convex hull, hidden-corner fill or hole fill.'}};
}
/** Black/yellow study treatment from src/card-material-study.ts:29,182-196.
 * SVG is deterministic flat artwork; no new generated image or 3D integration.
 */
export const PAMELA_SG_BACK_SVG=`<svg xmlns="http://www.w3.org/2000/svg" width="210" height="294" viewBox="0 0 210 294"><defs><pattern id="sg-grid" width="15" height="15" patternUnits="userSpaceOnUse"><path d="M0 0L15 15M15 0L0 15" stroke="#3a3521" stroke-width=".8"/></pattern></defs><rect width="210" height="294" fill="#0a0b0d"/><rect x="7" y="7" width="196" height="280" rx="11" fill="none" stroke="#edce39" stroke-width="2.2"/><rect x="14" y="14" width="182" height="266" rx="6" fill="url(#sg-grid)" stroke="#bba335" stroke-width=".8"/><rect x="40" y="94" width="130" height="106" rx="6" fill="#0a0b0d"/><path d="M48 115V102H61M162 115V102H149M162 178V191H149M48 178V191H61" fill="none" stroke="#edce39" stroke-width="2.5"/><g font-family="Segoe UI,Arial,sans-serif" text-anchor="middle"><text x="105" y="151" font-size="46" font-weight="700" fill="#edce39">SG</text><text x="105" y="175" font-size="10" fill="#f2f2f2">scout<tspan fill="#edce39">/</tspan>gaming</text><g fill="#edce39" font-size="12"><text x="105" y="53">♠ ♥ ♦ ♣</text><text x="105" y="248">♠ ♥ ♦ ♣</text></g></g></svg>`;
