export const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const grainChunk = `
  const float GRAIN_STRENGTH = 0.1;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
`;

export const frontFragmentShader = `
  uniform sampler2D uTexture;
  varying vec2 vUv;

  ${grainChunk}

  float noise(float x, float seed) {
    float i = floor(x);
    float f = fract(x);
    float u = f * f * (3.0 - 2.0 * f);
    return mix(hash(vec2(i, seed)), hash(vec2(i + 1.0, seed)), u);
  }

  float foldCrease(vec2 uv, float foldY, float seed) {
    float tilt = (hash(vec2(seed, 91.0)) - 0.5) * 0.012 * (uv.x - 0.5);

    float wobble =
      (noise(uv.x * 2.5, seed) - 0.5) * 0.012 +
      (noise(uv.x * 9.0, seed + 7.0) - 0.5) * 0.005 +
      (noise(uv.x * 37.0, seed + 13.0) - 0.5) * 0.0015;

    float depth = mix(0.35, 1.4, noise(uv.x * 6.0, seed + 19.0));

    float d = uv.y - (foldY + tilt + wobble);

    float crease = exp(-pow(d / 0.0018, 2.0)) * 0.2 * depth;
    float shadow = exp(-pow((d + 0.009) / 0.012, 2.0)) * 0.065 * depth;
    float highlight = exp(-pow((d - 0.0042) / 0.006, 2.0)) * 0.055;

    return -crease - shadow + highlight;
  }

  void main() {
    vec4 texColor = texture2D(uTexture, vUv);
    float grain = hash(gl_FragCoord.xy);

    float creases =
      foldCrease(vUv, 0.6667, 3.0) + foldCrease(vUv, 0.3333, 11.0);

    vec3 color = texColor.rgb - grain * GRAIN_STRENGTH + creases;
    gl_FragColor = vec4(color, texColor.a);
  }
`;

export const backFragmentShader = `
  ${grainChunk}

  void main() {
    float grain = hash(gl_FragCoord.xy);
    gl_FragColor = vec4(vec3(1.0 - grain * GRAIN_STRENGTH), 1.0);
  }
`;
