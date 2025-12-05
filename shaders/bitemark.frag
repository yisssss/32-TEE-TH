#ifdef GL_ES
precision mediump float;
#endif

// Curtains.js varying
varying vec3 vVertexPosition;
varying vec2 vTextureCoord;

// 텍스처 샘플러 (HTML에서 data-sampler 속성으로 지정된 이름과 일치해야 함)
uniform sampler2D uSampler0;     // 배경 (testimg.jpg)
uniform sampler2D uBiteTexture;  // 이빨자국 (clickimage.png)

// 커스텀 유니폼
uniform float uTime;
uniform vec2 uResolution;

// 이빨 자국 효과 (최대 10개 클릭 지점)
#define MAX_BITES 10
uniform vec2 uBitePositions[MAX_BITES];
uniform float uBiteIntensities[MAX_BITES];
uniform float uBiteRotations[MAX_BITES];
uniform int uBiteCount;

// 왜곡 강도 설정
uniform float uDistortionStrength;
uniform float uBiteRadius;

// 엠보싱 효과 설정
uniform float uBlurRadius;
uniform float uRingThickness;
uniform float uDilation;
uniform float uEdgeSoftness;
uniform float uHighlightIntensity;
uniform float uShadowIntensity;
uniform float uLightSpread;

const int MAX_BLUR = 12; // 블러 범위 증가

// 2D 회전 행렬 적용 함수
vec2 rotate2D(vec2 v, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

// clickimage.png의 밝기값을 기준으로 왜곡 마스크 생성
float getBiteMask(vec2 uv, vec2 center, float intensity, float radius, float rotation) {
    // 화면 비율 보정 (aspect ratio)
    float screenAspect = uResolution.x / uResolution.y;

    // 클릭 위치(center)를 중심으로 텍스처 좌표(biteUV) 계산
    vec2 delta = uv - center;

    // X축 스케일 보정 (정사각형으로 만들기)
    delta.x *= screenAspect;

    // 회전 적용 (중심점 기준)
    delta = rotate2D(delta, rotation);

    // 비율을 유지한 UV 계산
    vec2 biteUV = delta / (radius * 2.0) + 0.5;

    // 텍스처 범위(0~1) 벗어나면 마스크 없음
    if (biteUV.x < 0.0 || biteUV.x > 1.0 || biteUV.y < 0.0 || biteUV.y > 1.0) {
        return 0.0;
    }

    // clickimage.png를 샘플링 (밝기값이 마스크가 됨)
    vec4 biteColor = texture2D(uBiteTexture, biteUV);

    // 검은색 부분(이빨자국)만 마스크로 사용 (1.0 - r 로 반전)
    // PNG의 알파 채널도 고려
    float mask = (1.0 - biteColor.r) * biteColor.a * intensity;

    return mask;
}

// 블러된 마스크값 얻기 (엠보싱 효과를 위한 부드러운 전환)
float getBlurredMask(vec2 uv, vec2 center, float intensity, float radius, float rotation) {
    float total = 0.0;
    float count = 0.0;
    vec2 texel = 1.0 / uResolution;
    
    // MAX_BLUR를 사용하여 루프 반경을 제한
    const int MAX_BLUR_ITER = 20;
    float radiusLimit = min(uBlurRadius, float(MAX_BLUR_ITER));

    for (int x = -MAX_BLUR_ITER; x <= MAX_BLUR_ITER; x++) {
        // 블러 반경을 벗어나는 픽셀은 건너뛰기
        if (abs(float(x)) > radiusLimit) continue;
        for (int y = -MAX_BLUR_ITER; y <= MAX_BLUR_ITER; y++) {
            if (abs(float(y)) > radiusLimit) continue;
            
            vec2 offset = vec2(float(x), float(y)) * texel;
            
            // Dilation 효과 적용 (uDilation 사용)
            vec2 dilatedOffset = offset * (1.0 + uDilation);
            
            float maskValue = getBiteMask(uv + dilatedOffset, center, intensity, radius, rotation);
            
            total += maskValue; // 단순 합산 (가중치 제거)
            count += 1.0;
        }
    }

    // 평균 반환 (가중치 합 대신 count로 나누기)
    return total / max(count, 1.0);
}

// 법선 벡터 계산 (왜곡 방향 결정)
vec2 getNormal(vec2 uv, vec2 center, float intensity, float radius, float rotation) {
    vec2 texel = 1.0 / uResolution;

    float l = getBlurredMask(uv - vec2(texel.x, 0.0), center, intensity, radius, rotation);
    float r = getBlurredMask(uv + vec2(texel.x, 0.0), center, intensity, radius, rotation);
    float t = getBlurredMask(uv - vec2(0.0, texel.y), center, intensity, radius, rotation);
    float b = getBlurredMask(uv + vec2(0.0, texel.y), center, intensity, radius, rotation);

    vec2 grad = vec2(r - l, b - t);
    return normalize(grad + 1e-6);
}

void main() {
    vec2 uv = vTextureCoord;
    vec2 totalDistortion = vec2(0.0);
    float totalMaskFade = 0.0; // 전체 마스크 페이드 누적
    vec2 texel = 1.0 / uResolution;

    // 모든 클릭 지점에 대해 반복
    for (int i = 0; i < MAX_BITES; i++) {
        if (i >= uBiteCount) break;

        vec2 bitePos = uBitePositions[i];
        float intensity = uBiteIntensities[i];
        float radius = uBiteRadius;
        float rotation = uBiteRotations[i];

        // 블러된 마스크값 계산 (현재 픽셀)
        float blurredMask = getBlurredMask(uv, bitePos, intensity, radius, rotation);

        // 마스크 경계를 부드럽게 만들기 (smoothstep으로 페이드)
        // 경계를 더 넓게 페이드 (0~0.25 범위)
        float maskFade = smoothstep(0.0, 0.25, blurredMask);

        if (blurredMask > 0.001) {
            // 주변 픽셀의 블러된 마스크값으로 법선 계산
            vec2 normal = getNormal(uv, bitePos, intensity, radius, rotation);

            // 링 효과: 중심부와 외곽의 강도 차이
            float ringCenter = 0.5;
            float halfWidth = ringCenter * uRingThickness;
            float innerEdge = ringCenter - halfWidth;
            float outerEdge = ringCenter + halfWidth;
            float softness = halfWidth * uEdgeSoftness;

            float fadeIn = smoothstep(innerEdge, innerEdge + softness, blurredMask);
            float fadeOut = 1.0 - smoothstep(outerEdge - softness, outerEdge, blurredMask);
            float ringIntensity = fadeIn * fadeOut;

            // 왜곡 누적 (법선 방향으로, 마스크 페이드 적용)
            totalDistortion += normal * uDistortionStrength * ringIntensity * maskFade;
            totalMaskFade = max(totalMaskFade, maskFade); // 전체 마스크 페이드 업데이트
        }
    }

    // 왜곡 적용된 UV
    vec2 distortedUv = uv + totalDistortion;

    // testimg.jpg 샘플링 (왜곡된 좌표 사용)
    vec4 color = texture2D(uSampler0, distortedUv);

    // 엠보싱 효과 (마스크 페이드 적용하여 경계 부드럽게)
    if (length(totalDistortion) > 0.001) {
        vec2 lightDir = normalize(vec2(1.0, -1.0));
        vec2 distortNormal = normalize(totalDistortion);
        float diffuse = dot(distortNormal, lightDir);

        // 하이라이트 & 쉐도우 (마스크 페이드로 경계 부드럽게)
        float embossFade = totalMaskFade; // 마스크 페이드를 엠보싱에도 적용
        color.rgb += vec3(max(0.0, diffuse)) * uHighlightIntensity * embossFade;
        color.rgb *= (1.0 - max(0.0, -diffuse) * uShadowIntensity * embossFade);
    }

    gl_FragColor = color;
}