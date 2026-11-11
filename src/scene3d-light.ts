// Light that moves across the dealer and the table. First animation: the soft shadow of a slowly turning
// three-blade fan below a lamp over the table. Each blade passes about every `period` seconds and dims what
// it covers a little. The film cannot be relit, so this is a multiplication on top of the film's own light:
// it reads as a moving shadow as long as it stays weak. With strength 0 nothing is changed.
import * as T from 'three';
import {solveCamera, type FilmCamera} from './scene3d-geometry.ts';

// p is a world position; the shade is 1 outside the blade shadows.
export const FAN_GLSL = `uniform vec3 fanLight, fanCentre; uniform vec4 fan; // fan: angle, strength, hub radius, blade radius
float fanShade(vec3 p){
  if (fan.y <= 0.) return 1.;
  vec3 d = fanLight - p; if (d.y <= 0.) return 1.;
  float t = (fanCentre.y - p.y) / d.y; if (t <= 0. || t >= 1.) return 1.;
  vec2 q = (p + d * t).xz - fanCentre.xz; float r = length(q), third = 2.0943951;
  float blade = abs(fract((atan(q.y, q.x) - fan.x) / third + .5) - .5) * third; // angle to the nearest blade
  float m = (1. - smoothstep(.14, .46, blade)) * smoothstep(fan.z * .6, fan.z, r) * (1. - smoothstep(fan.w * .85, fan.w * 1.1, r));
  return 1. - fan.y * m;
}`;

export function createFanLight() {
  const uniforms = {fanLight: {value: new T.Vector3()}, fanCentre: {value: new T.Vector3()}, fan: {value: new T.Vector4(0, 0, 0.1, 0.7)}, toTarget: {value: 0}};
  return {
    uniforms,
    // The lamp hangs high over the table just in front of the dealer, a little to image left, and the fan turns well below it.
    // The blade shadows then lie like slow spokes over her and the felt, so one side of her dims before the other. Dealer metres, scaled by k.
    place(camera: FilmCamera) { const k = camera.scale, edge = -solveCamera(camera).edgeDistance; uniforms.fanLight.value.set(-0.3 * k, 3.0 * k, edge + 0.25 * k); uniforms.fanCentre.value.set(-0.3 * k, 1.6 * k, edge + 0.25 * k); uniforms.fan.value.z = 0.08 * k; uniforms.fan.value.w = 0.9 * k; },
    update(seconds: number, on: boolean, strength: number, period: number) { uniforms.fan.value.x = seconds * (2 * Math.PI / 3) / Math.max(0.5, period); uniforms.fan.value.y = on ? strength : 0; },
    // Built-in materials of the table get the same shade as the film, applied after colour encoding so that both darken alike.
    // `toTarget` makes them write sRGB values when the foreground is drawn into a render target (three.js writes linear there).
    hook<M extends T.Material>(material: M): M {
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = 'varying vec3 vS3World;\n' + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vS3World = (modelMatrix * vec4(transformed, 1.)).xyz;');
        shader.fragmentShader = 'varying vec3 vS3World; uniform float toTarget;\n' + FAN_GLSL + '\n' + shader.fragmentShader.replace('#include <colorspace_fragment>', '#include <colorspace_fragment>\n if (toTarget > .5) gl_FragColor = sRGBTransferOETF(gl_FragColor);\n gl_FragColor.rgb *= fanShade(vS3World);');
      };
      material.customProgramCacheKey = () => 'scene3d-light';
      return material;
    },
  };
}
