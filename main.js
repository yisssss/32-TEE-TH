import {Curtains, Plane} from './curtainsjs/src/index.mjs';

// ============================================
// 📌 모든 상수 설정 (한 곳에서 관리)
// ============================================
const CONSTANTS = {
    // 기본 설정
    MAX_BITES: 10,
    MIN_PRESS_DURATION: 60,
    MAX_PRESS_DURATION: 1500,
    MIN_PRESS_INTENSITY: 0.05,
    MAX_PRESS_INTENSITY: 0.7,
    
    // Loading Progress 설정
    LOADING_PROGRESS: {
        increaseSpeed: 0.08,           // 증가 속도 (높을수록 빠름)
        decreaseSpeed: 0.15,           // 감소 속도 (높을수록 빠름)        
        maxTime: 2000,                 // 최대 시간 (ms) - 이 시간에 100% 도달
        easePower: 3,                  // easing 강도 (높을수록 100%에 가까워질수록 느림)
    },
    
    // Loading Plane Shader Uniforms (Progress에 따라 동적 조정)
    LOADING_PLANE: {
        // 셰이더 상수
        MAX_BLUR: 12,                  // 셰이더의 MAX_BLUR 상수
        
        // 고정 값
        distortionStrength: 0.6,        // 왜곡 강도
        dilation: 0.02,                 // 확장
        highlightIntensity: 0.3,        // 하이라이트 강도
        shadowIntensity: 0.5,           // 그림자 강도
        lightSpread: 1.5,               // 빛 확산
        
        // Progress에 따라 조정되는 값 (min -> max)
        biteRadius: {
            min: 0.44,                   // 최소값 (progress 0%)
            max: 0.44,                   // 최대값 (progress 100%)
        },
        blurRadius: {
            min: 2.0,                   // 최소값 (progress 0%)
            max: 8.0,                   // 최대값 (progress 100%)
        },
        ringThickness: {
            min: 0.8,                   // 최소값 (progress 0%)
            max: 8.0,                   // 최대값 (progress 100%)
        },
        edgeSoftness: {
            min: 2.0,                   // 최소값 (progress 0%)
            max: 5.0,                   // 최대값 (progress 100%)
        },
    },
    
    // Main Plane Shader Uniforms
    MAIN_PLANE: {
        distortionStrength: 0.04,       // 왜곡 강도
        biteRadius: 0.3,                // 이빨 자국 반경
        blurRadius: 4.0,                // 블러 범위
        ringThickness: 0.8,             // 링 두께
        dilation: 2.0,                  // 확장
        edgeSoftness: 0.8,              // 가장자리 부드러움
        highlightIntensity: 0.3,        // 하이라이트 강도
        shadowIntensity: 0.5,           // 그림자 강도
        lightSpread: 1.5,               // 빛 확산
    },
};

window.addEventListener("load", () => {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
        return;
    }
    
    gsap.registerPlugin(ScrollTrigger);
    
    const curtains = new Curtains({
        container: "canvas",
        watchScroll: false,
        pixelRatio: Math.min(1.5, window.devicePixelRatio)
    });

    // handling errors
    curtains.onError(() => {
        document.body.classList.add("no-curtains");
    }).onContextLost(() => {
        curtains.restoreContext();
    });

    // get our plane element
    const planeElements = document.getElementsByClassName("curtain");

    // bitemark 쉐이더를 사용하기 위한 변수들 (상수 객체에서 참조)
    const MAX_BITES = CONSTANTS.MAX_BITES;
    const MIN_PRESS_DURATION = CONSTANTS.MIN_PRESS_DURATION;
    const MAX_PRESS_DURATION = CONSTANTS.MAX_PRESS_DURATION;
    const MIN_PRESS_INTENSITY = CONSTANTS.MIN_PRESS_INTENSITY;
    const MAX_PRESS_INTENSITY = CONSTANTS.MAX_PRESS_INTENSITY;

    // 순환 인덱스 사용 (가장 오래된 것을 덮어쓰기)
    let currentBiteIndex = 0;
    let biteCount = 0;
    // 평탄화된 배열 미리 생성
    const bitePositions = new Float32Array(MAX_BITES * 2);
    const biteIntensities = new Float32Array(MAX_BITES);
    const biteRotations = new Float32Array(MAX_BITES); // 각 bite의 회전 각도

    // 현재 클릭 상태 추적
    let pressStartTime = 0;
    let currentPressIndex = -1;
    let isMouseDown = false;

    // shaders 폴더의 쉐이더 파일들을 읽어오기
    let vs = '';
    let fs = '';

    // DOM 요소
    const loadingPage = document.getElementById('loading-page');
    const loadingInstructionGrid = document.getElementById('loading-instruction-grid');
    const loadingPercentageGrid = document.getElementById('loading-percentage-grid');
    const loadingPercentageCenter = loadingPercentageGrid ? loadingPercentageGrid.querySelector('.loading-percentage-center') : null;
    const pageContent = document.getElementById('page-content');
    const teethScrollbar = document.getElementById('teeth-scrollbar');

    // 로딩 페이지 관련 변수
    let loadingProgress = 0;
    let loadingPlane = null;
    
    // Story 섹션 현재 챕터 추적
    let currentStoryChapter = 1;

    // 쉐이더 파일들을 비동기로 로드
    Promise.all([
        fetch('shaders/bitemark.vert').then(res => res.text()),
        fetch('shaders/bitemark.frag').then(res => res.text())
    ]).then(([vertexShader, fragmentShader]) => {
        vs = vertexShader;
        fs = fragmentShader;
        initLoadingPage();
    }).catch(err => {
        document.body.classList.add("no-curtains");
    });

    // 로딩 페이지 초기화
    function initLoadingPage() {
        if (!loadingPage) {
            initPlane();
            return;
        }

        const canvasElement = document.getElementById('canvas');
        if (canvasElement) {
            canvasElement.style.pointerEvents = 'none';
        }

        const loadingVideoContainer = document.getElementById('loading-video-container');
        const loadingVideo = document.getElementById('loading-video');
        const loadingBackgroundContainer = document.getElementById('loading-background-container');
        const loadingImageContainer = document.getElementById('loading-image-container');
        
        if (!loadingVideoContainer || !loadingVideo || !loadingBackgroundContainer || !loadingImageContainer) {
            initPlane();
            return;
        }

        // 배경 이미지 로드 후 원본 사이즈 가져오기
        const backgroundImg = loadingImageContainer.querySelector('img[data-sampler="uSampler0"]');
        if (!backgroundImg) {
            initPlane();
            return;
        }

        // 포토몽타주 비디오 배열 (순환 재생)
        const videos = [
            'assets/video/포토몽타주-이빨.mp4',
            'assets/video/포토몽타주-매끈한 음식.mp4',
            'assets/video/포토몽타주-가축.mp4'
        ];
        
        let currentVideoIndex = 0;
        let isPlayingVideo = true;
        let isShowingBackground = false;
        let videoClicked = false;
        let backgroundTimeout = null;
        let resetToVideoTimeout = null; // 10초 후 비디오로 복귀하는 타이머

        // 비디오 로드 및 재생
        function playVideo(index) {
            if (videoClicked) return;
            
            currentVideoIndex = index % videos.length;
            loadingVideo.src = videos[currentVideoIndex];
            loadingVideo.load();
            
            loadingVideoContainer.style.display = 'block';
            loadingBackgroundContainer.style.display = 'none';
            isPlayingVideo = true;
            isShowingBackground = false;
            
            loadingVideo.play().catch(err => {
                console.warn('비디오 재생 실패:', err);
            });
        }

        // 배경 이미지 표시 (1.5초)
        function showBackground() {
            if (videoClicked) return;
            
            loadingVideoContainer.style.display = 'none';
            loadingBackgroundContainer.style.display = 'block';
            isPlayingVideo = false;
            isShowingBackground = true;
            
            // 1.5초 후 다음 비디오 재생
            backgroundTimeout = setTimeout(() => {
                playVideo(currentVideoIndex + 1);
            }, 1500);
        }

        // 비디오 종료 이벤트
        loadingVideo.addEventListener('ended', () => {
            if (!videoClicked) {
                showBackground();
            }
        });

        // 첫 비디오 재생 시작
        playVideo(0);

        // 첫 클릭 시 현재 상태에서 멈추고 shader 작동
        const onFirstClick = (e) => {
            if (videoClicked) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            videoClicked = true;
            
            // 타임아웃 정리
            if (backgroundTimeout) {
                clearTimeout(backgroundTimeout);
                backgroundTimeout = null;
            }
            
            // 비디오 정지
            loadingVideo.pause();
            
            // 현재 배경이 표시되고 있으면 그대로 유지, 아니면 배경으로 전환
            if (!isShowingBackground) {
                loadingVideoContainer.style.display = 'none';
                loadingBackgroundContainer.style.display = 'block';
            }
            
            // CLICK TO BITE 숨기고 percentage 표시
            if (loadingInstructionGrid) {
                loadingInstructionGrid.style.display = 'none';
            }
            if (loadingPercentageGrid) {
                loadingPercentageGrid.style.display = 'grid';
            }
            
            // 약간의 지연 후 shader plane 표시
            setTimeout(() => {
                loadingVideoContainer.style.display = 'none';
                loadingBackgroundContainer.style.display = 'none';
                loadingImageContainer.style.display = 'block';
                setupPlaneWithImageSize();
            }, 100);
            
            // 이벤트 리스너 제거
            loadingPage.removeEventListener('mousedown', onFirstClick);
            loadingPage.removeEventListener('touchstart', onFirstClick);
        };

        // 초기 클릭 이벤트 등록
        loadingPage.addEventListener('mousedown', onFirstClick, { passive: false });
        loadingPage.addEventListener('touchstart', onFirstClick, { passive: false });

            // 이미지 컨테이너 및 Plane 설정 함수
        const setupPlaneWithImageSize = () => {
            const imgWidth = backgroundImg.naturalWidth || backgroundImg.width;
            const imgHeight = backgroundImg.naturalHeight || backgroundImg.height;
            
            if (imgWidth === 0 || imgHeight === 0) {
                loadingImageContainer.style.width = '800px';
                loadingImageContainer.style.height = '800px';
            } else {
                loadingImageContainer.style.width = imgWidth + 'px';
                loadingImageContainer.style.height = imgHeight + 'px';
            }

            let pressStartTime = 0;
            let isPressing = false;
            let isCompleted = false;
            let currentBiteIndex = -1;
            
            // 이벤트 핸들러 참조 저장 (나중에 제거하기 위해)
            let onPressStartHandler = null;
            let onPressEndHandler = null;
            
            // 10초 후 비디오로 복귀하는 함수
            const resetToVideo = () => {
                if (isCompleted) return; // 완료된 경우 복귀하지 않음
                
                // 타이머 정리
                if (resetToVideoTimeout) {
                    clearTimeout(resetToVideoTimeout);
                    resetToVideoTimeout = null;
                }
                
                // 상태 리셋
                videoClicked = false;
                
                // shader plane 숨기기
                if (loadingImageContainer) {
                    loadingImageContainer.style.display = 'none';
                }
                
                // CLICK TO BITE 다시 표시하고 percentage 숨기기
                if (loadingInstructionGrid) {
                    loadingInstructionGrid.style.display = 'grid';
                }
                if (loadingPercentageGrid) {
                    loadingPercentageGrid.style.display = 'none';
                }
                
                // 비디오 재생 재개
                playVideo(currentVideoIndex);
            };
            
            // 이빨 자국 데이터
            const loadingBitePositions = new Float32Array(MAX_BITES * 2);
            const loadingBiteIntensities = new Float32Array(MAX_BITES);
            const loadingBiteRotations = new Float32Array(MAX_BITES);
            let loadingBiteCount = 0;
            
            // Plane 파라미터 (현재 쉐이더 구조에 맞춤)
            const params = {
                vertexShader: vs,
                fragmentShader: fs,
                widthSegments: 20,
                heightSegments: 20,
                uniforms: {
                    resolution: {
                        name: "uResolution",
                        type: "2f",
                        value: [imgWidth || 800, imgHeight || 800],
                    },
                time: {
                    name: "uTime",
                    type: "1f",
                    value: 0,
                },
                bitePositions: {
                    name: "uBitePositions",
                    type: "2fv",
                    value: loadingBitePositions,
                },
                biteIntensities: {
                    name: "uBiteIntensities",
                    type: "1fv",
                    value: loadingBiteIntensities,
                },
                biteRotations: {
                    name: "uBiteRotations",
                    type: "1fv",
                    value: loadingBiteRotations,
                },
                biteCount: {
                    name: "uBiteCount",
                    type: "1i",
                    value: 0,
                },
                distortionStrength: {
                    name: "uDistortionStrength",
                    type: "1f",
                    value: CONSTANTS.LOADING_PLANE.distortionStrength,
                },
                biteRadius: {
                    name: "uBiteRadius",
                    type: "1f",
                    value: CONSTANTS.LOADING_PLANE.biteRadius.min, // 초기값은 min
                },
                blurRadius: {
                    name: "uBlurRadius",
                    type: "1f",
                    value: CONSTANTS.LOADING_PLANE.blurRadius.min, // 초기값은 min
                },
                ringThickness: {
                    name: "uRingThickness",
                    type: "1f",
                    value: CONSTANTS.LOADING_PLANE.ringThickness.min, // 초기값은 min
                },
                dilation: {
                    name: "uDilation",
                    type: "1f",
                    value: CONSTANTS.LOADING_PLANE.dilation,
                },
                edgeSoftness: {
                    name: "uEdgeSoftness",
                    type: "1f",
                    value: CONSTANTS.LOADING_PLANE.edgeSoftness.min, // 초기값은 min
                },
                highlightIntensity: {
                    name: "uHighlightIntensity",
                    type: "1f",
                    value: CONSTANTS.LOADING_PLANE.highlightIntensity,
                },
                shadowIntensity: {
                    name: "uShadowIntensity",
                    type: "1f",
                    value: CONSTANTS.LOADING_PLANE.shadowIntensity,
                },
                lightSpread: {
                    name: "uLightSpread",
                    type: "1f",
                    value: CONSTANTS.LOADING_PLANE.lightSpread,
                }
            }
            };
            
            // Plane 생성 (이미지 컨테이너에 적용)
            loadingPlane = new Plane(curtains, loadingImageContainer, params);
            
            loadingPlane.onReady(() => {
                // 이미지 컨테이너에 pointer-events 명시적 설정
                if (loadingImageContainer) {
                    loadingImageContainer.style.pointerEvents = 'auto';
                }

                // Plane 크기 확인
                const planeBoundingRect = loadingPlane.getBoundingRect();
                loadingPlane.uniforms.resolution.value = [planeBoundingRect.width, planeBoundingRect.height];
                
                onPressStartHandler = function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                if (isCompleted) {
                    return;
                }
                
                // 10초 타이머 취소 (다시 클릭했으므로)
                if (resetToVideoTimeout) {
                    clearTimeout(resetToVideoTimeout);
                    resetToVideoTimeout = null;
                }
                
                // 항상 첫 번째 bite만 사용 (재사용)
                currentBiteIndex = 0;
                
                if (loadingBiteCount === 0) {
                    // 처음 클릭 시에만 bite 초기화
                    loadingBitePositions[0] = 0.5;
                    loadingBitePositions[1] = 0.5;
                    loadingBiteIntensities[0] = MIN_PRESS_INTENSITY;
                    loadingBiteRotations[0] = 0;
                    loadingBiteCount = 1;  // 항상 1개만 유지
                    
                    // uniform 초기화 (처음 한 번만)
                    loadingPlane.uniforms.biteCount.value = 1;
                    loadingPlane.uniforms.bitePositions.value = new Float32Array(loadingBitePositions);
                    loadingPlane.uniforms.biteRotations.value = new Float32Array(loadingBiteRotations);
                    
                    if (loadingPlane.uniforms.bitePositions.lastValue) {
                        loadingPlane.uniforms.bitePositions.lastValue = null;
                    }
                    if (loadingPlane.uniforms.biteRotations.lastValue) {
                        loadingPlane.uniforms.biteRotations.lastValue = null;
                    }
                } else {
                    // 이미 존재하는 bite를 재사용 - intensity만 리셋
                    loadingBiteIntensities[0] = MIN_PRESS_INTENSITY;
                }
                
                isPressing = true;
                pressStartTime = Date.now();
            };
            
            onPressEndHandler = function(e) {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                
                if (!isPressing) return;
                
                isPressing = false;
                // currentBiteIndex는 유지하여 감소 로직이 작동하도록 함
                
                // 기존 타이머가 있으면 취소
                if (resetToVideoTimeout) {
                    clearTimeout(resetToVideoTimeout);
                }
                
                // 10초 후 비디오로 복귀하는 타이머 시작
                resetToVideoTimeout = setTimeout(() => {
                    resetToVideo();
                }, 10000);
            };
            
            // 마우스/터치 이벤트 (로딩 페이지 전체에서 감지)
            loadingPage.addEventListener('mousedown', onPressStartHandler, { passive: false });
            loadingPage.addEventListener('mouseup', onPressEndHandler, { passive: false });
            loadingPage.addEventListener('mouseleave', onPressEndHandler, { passive: false });
            loadingPage.addEventListener('touchstart', onPressStartHandler, { passive: false });
            loadingPage.addEventListener('touchend', onPressEndHandler, { passive: false });
            loadingPage.addEventListener('touchcancel', onPressEndHandler, { passive: false });
            }); // onReady() 닫기
            
            // 렌더링 루프
            loadingPlane.onRender(() => {
                loadingPlane.uniforms.time.value++;
                
                // 프로그레스 업데이트
                if (isPressing && !isCompleted && currentBiteIndex >= 0) {
                    const pressDuration = Date.now() - pressStartTime;
                    const rawProgress = Math.min(pressDuration / CONSTANTS.LOADING_PROGRESS.maxTime, 1.0);
                    
                    // Easing 함수: 100%에 가까워질수록 천천히 증가
                    // easeOut 함수 사용: 1 - (1 - x)^power
                    const easedProgress = 1.0 - Math.pow(1.0 - rawProgress, CONSTANTS.LOADING_PROGRESS.easePower);
                    
                    // 현재 이빨 자국의 강도 증가 (easing 적용된 값으로)
                    const targetIntensity = easedProgress;
                    const currentIntensity = loadingBiteIntensities[currentBiteIndex];
                    const diff = targetIntensity - currentIntensity;
                    
                    // 증가 속도 적용
                    loadingBiteIntensities[currentBiteIndex] += diff * CONSTANTS.LOADING_PROGRESS.increaseSpeed;
                    
                    // 0~1 범위 제한
                    loadingBiteIntensities[currentBiteIndex] = Math.max(0, Math.min(1, loadingBiteIntensities[currentBiteIndex]));
                    
                    // 현재 이빨 자국의 강도를 진행도로 사용
                    loadingProgress = loadingBiteIntensities[currentBiteIndex];
                    
                    // Progress에 따라 동적으로 uniform 값 조정
                    const progress = loadingProgress; // 0~1
                    
                    // Lerp 함수: min + (max - min) * progress
                    loadingPlane.uniforms.biteRadius.value = 
                        CONSTANTS.LOADING_PLANE.biteRadius.min + 
                        (CONSTANTS.LOADING_PLANE.biteRadius.max - CONSTANTS.LOADING_PLANE.biteRadius.min) * progress;
                    
                    loadingPlane.uniforms.blurRadius.value = 
                        CONSTANTS.LOADING_PLANE.blurRadius.min + 
                        (CONSTANTS.LOADING_PLANE.blurRadius.max - CONSTANTS.LOADING_PLANE.blurRadius.min) * progress;
                    
                    loadingPlane.uniforms.ringThickness.value = 
                        CONSTANTS.LOADING_PLANE.ringThickness.min + 
                        (CONSTANTS.LOADING_PLANE.ringThickness.max - CONSTANTS.LOADING_PLANE.ringThickness.min) * progress;
                    
                    loadingPlane.uniforms.edgeSoftness.value = 
                        CONSTANTS.LOADING_PLANE.edgeSoftness.min + 
                        (CONSTANTS.LOADING_PLANE.edgeSoftness.max - CONSTANTS.LOADING_PLANE.edgeSoftness.min) * progress;
                    
                    // 유니폼 업데이트 (새로운 배열 인스턴스 생성)
                    loadingPlane.uniforms.biteIntensities.value = new Float32Array(loadingBiteIntensities);
                    if (loadingPlane.uniforms.biteIntensities.lastValue) {
                        loadingPlane.uniforms.biteIntensities.lastValue = null;
                    }
                    
                    // 100% 도달 체크
                    if (loadingProgress >= 0.99 && !isCompleted) {
                        isCompleted = true;
                        loadingProgress = 1.0;
                        loadingBiteIntensities[currentBiteIndex] = 1.0;
                        
                        // 10초 타이머 취소 (완료되었으므로 비디오로 복귀하지 않음)
                        if (resetToVideoTimeout) {
                            clearTimeout(resetToVideoTimeout);
                            resetToVideoTimeout = null;
                        }
                        
                        // 100%일 때 최대값으로 uniform 설정
                        loadingPlane.uniforms.biteRadius.value = CONSTANTS.LOADING_PLANE.biteRadius.max;
                        loadingPlane.uniforms.blurRadius.value = CONSTANTS.LOADING_PLANE.blurRadius.max;
                        loadingPlane.uniforms.ringThickness.value = CONSTANTS.LOADING_PLANE.ringThickness.max;
                        loadingPlane.uniforms.edgeSoftness.value = CONSTANTS.LOADING_PLANE.edgeSoftness.max;
                        
                        loadingPlane.uniforms.biteIntensities.value = new Float32Array(loadingBiteIntensities);
                        if (loadingPlane.uniforms.biteIntensities.lastValue) {
                            loadingPlane.uniforms.biteIntensities.lastValue = null;
                        }
                        
                        // 2초 후 메인 페이지로
                        setTimeout(() => {
                            startMainPage();
                        }, 2000);
                    }
                    
                } else if (!isPressing && !isCompleted) {
                    // 클릭하지 않을 때 현재 이빨 자국 감소
                    if (currentBiteIndex >= 0 && currentBiteIndex < loadingBiteCount && loadingBiteIntensities[currentBiteIndex] > 0) {
                        // 감소 속도 적용 (0에 가까워질수록 천천히)
                        const currentIntensity = loadingBiteIntensities[currentBiteIndex];
                        const decreaseAmount = currentIntensity * CONSTANTS.LOADING_PROGRESS.decreaseSpeed;
                        loadingBiteIntensities[currentBiteIndex] = Math.max(0, currentIntensity - decreaseAmount);
                        
                        // loadingProgress 업데이트 (현재 bite의 intensity 사용)
                        loadingProgress = loadingBiteIntensities[currentBiteIndex];
                        
                        // Progress에 따라 동적으로 uniform 값 조정
                        const progress = loadingProgress; // 0~1
                        
                        // Lerp 함수: min + (max - min) * progress
                        loadingPlane.uniforms.biteRadius.value = 
                            CONSTANTS.LOADING_PLANE.biteRadius.min + 
                            (CONSTANTS.LOADING_PLANE.biteRadius.max - CONSTANTS.LOADING_PLANE.biteRadius.min) * progress;
                        
                        loadingPlane.uniforms.blurRadius.value = 
                            CONSTANTS.LOADING_PLANE.blurRadius.min + 
                            (CONSTANTS.LOADING_PLANE.blurRadius.max - CONSTANTS.LOADING_PLANE.blurRadius.min) * progress;
                        
                        loadingPlane.uniforms.ringThickness.value = 
                            CONSTANTS.LOADING_PLANE.ringThickness.min + 
                            (CONSTANTS.LOADING_PLANE.ringThickness.max - CONSTANTS.LOADING_PLANE.ringThickness.min) * progress;
                        
                        loadingPlane.uniforms.edgeSoftness.value = 
                            CONSTANTS.LOADING_PLANE.edgeSoftness.min + 
                            (CONSTANTS.LOADING_PLANE.edgeSoftness.max - CONSTANTS.LOADING_PLANE.edgeSoftness.min) * progress;
                        
                        // 유니폼 업데이트 (새로운 배열 인스턴스 생성하여 강제 업데이트)
                        loadingPlane.uniforms.biteIntensities.value = new Float32Array(loadingBiteIntensities);
                        if (loadingPlane.uniforms.biteIntensities.lastValue) {
                            loadingPlane.uniforms.biteIntensities.lastValue = null;
                        }
                        
                        // 0에 도달하면 intensity를 0으로 고정
                        if (loadingBiteIntensities[currentBiteIndex] <= 0.001) {
                            loadingBiteIntensities[currentBiteIndex] = 0;
                            loadingProgress = 0;
                            currentBiteIndex = -1;
                        }
                    }
                }
                
                // 유니폼 업데이트 (매 프레임마다 새로운 배열 인스턴스 생성)
                loadingPlane.uniforms.bitePositions.value = new Float32Array(loadingBitePositions);
                loadingPlane.uniforms.biteRotations.value = new Float32Array(loadingBiteRotations);
                if (loadingPlane.uniforms.bitePositions.lastValue) {
                    loadingPlane.uniforms.bitePositions.lastValue = null;
                }
                if (loadingPlane.uniforms.biteRotations.lastValue) {
                    loadingPlane.uniforms.biteRotations.lastValue = null;
                }
                
                // 퍼센티지 표시 (항상 업데이트)
                if (loadingPercentageCenter) {
                    loadingPercentageCenter.textContent = Math.round(loadingProgress * 100);
                }
            }).onAfterResize(() => {
                // 리사이즈 시 plane 크기 업데이트 (이미지 원본 사이즈 유지)
                const planeBoundingRect = loadingPlane.getBoundingRect();
                loadingPlane.uniforms.resolution.value = [planeBoundingRect.width, planeBoundingRect.height];
            }).onError(() => {
                // 실패 시 메인 plane으로 진행
                initPlane();
            });
        };

        // 이미지 로드는 백그라운드에서 진행 (클릭 시 바로 사용하기 위해)
        // 하지만 setupPlaneWithImageSize는 클릭 후에만 호출됨
    }

    // 메인 페이지 시작
    function startMainPage() {
        // 로딩 정리 함수
        function cleanupLoading() {
            // 로딩 plane 제거
            if (loadingPlane) {
                loadingPlane.remove();
                loadingPlane = null;
            }
            
            // 캔버스 요소 제거
            const canvasElement = document.getElementById('canvas');
            if (canvasElement && canvasElement.parentNode) {
                canvasElement.parentNode.removeChild(canvasElement);
            }
            
            // 로딩 페이지 제거
            if (loadingPage && loadingPage.parentNode) {
                loadingPage.parentNode.removeChild(loadingPage);
            }
            
            // 메인 콘텐츠 표시
            if (pageContent) {
                pageContent.style.display = 'block';
                pageContent.style.opacity = '1';
            }
            
            // 스크롤바 표시
            if (teethScrollbar) {
                teethScrollbar.classList.add('active');
            }
            
            // HTML 기능 초기화 (스크롤 시스템 포함)
            initHTMLFeatures();
            
            // 메인 plane 초기화 (plane 요소가 있을 경우에만)
            if (planeElements.length > 0) {
                setTimeout(() => {
                    initPlane();
                }, 600);
            }
        }
        
        // 로딩 페이지 페이드아웃
        if (gsap && loadingPage) {
            gsap.to(loadingPage, {
                opacity: 0,
                duration: 0.5,
                onComplete: cleanupLoading
            });
        } else {
            cleanupLoading();
        }
    }

    // Intensity 업데이트 함수
    function updateBiteIntensity(plane, index, pressDuration) {
        if (index < 0 || index >= MAX_BITES) return;

        const normalized = Math.max(0, Math.min(1,
            (pressDuration - MIN_PRESS_DURATION) / (MAX_PRESS_DURATION - MIN_PRESS_DURATION)
        ));

        const newIntensity = MIN_PRESS_INTENSITY +
            (MAX_PRESS_INTENSITY - MIN_PRESS_INTENSITY) * normalized;

        if (Math.abs(biteIntensities[index] - newIntensity) > 0.01) {
            biteIntensities[index] = newIntensity;
            plane.uniforms.biteIntensities.value = biteIntensities;
        }
    }

    // 이미지/비디오 비율에 맞춰 plane 크기 조정
    function adjustPlaneSize(planeElement, media) {
        // 비디오인지 이미지인지 확인
        const isVideo = media.tagName === 'VIDEO';
        const mediaWidth = isVideo ? media.videoWidth : media.naturalWidth;
        const mediaHeight = isVideo ? media.videoHeight : media.naturalHeight;
        const mediaAspect = mediaWidth / mediaHeight;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // 60vw를 기준으로 하되, 미디어 비율 유지
        let planeWidth = viewportWidth * 0.6;
        let planeHeight = planeWidth / mediaAspect;

        // 높이가 화면을 벗어나면 높이 기준으로 재조정
        if (planeHeight > viewportHeight * 0.8) {
            planeHeight = viewportHeight * 0.8;
            planeWidth = planeHeight * mediaAspect;
        }

        planeElement.style.width = planeWidth + 'px';
        planeElement.style.height = planeHeight + 'px';
    }

    function initPlane() {
        // plane 생성 전에 초기 크기 설정
        const planeElement = planeElements[0];
        const media = planeElement.querySelector('img[data-sampler="uSampler0"]') ||
                      planeElement.querySelector('video[data-sampler="uSampler0"]');

        // 미디어가 이미 로드되어 있다면 크기 조정
        const isLoaded = media.tagName === 'VIDEO' ?
                        (media.readyState >= 2 && media.videoWidth > 0) :
                        (media.complete && media.naturalWidth > 0);

        if (isLoaded) {
            adjustPlaneSize(planeElement, media);
            // 비디오인 경우 재생 시작
            if (media.tagName === 'VIDEO' && media.paused) {
                media.play().catch(err => {});
            }
        } else {
            // 기본 크기 설정 (미디어 로드 전)
            planeElement.style.width = '60vw';
            planeElement.style.height = '60vh';

            // 비디오인 경우 로드 후 재생
            if (media.tagName === 'VIDEO') {
                media.addEventListener('loadeddata', () => {
                    media.play().catch(err => {});
                }, { once: true });
            }
        }

        // parameters
        const params = {
            vertexShader: vs,
            fragmentShader: fs,
            widthSegments: 20,
            heightSegments: 20,
            uniforms: {
                resolution: {
                    name: "uResolution",
                    type: "2f",
                    value: [planeElements[0].clientWidth, planeElements[0].clientHeight],
                },
                time: {
                    name: "uTime",
                    type: "1f",
                    value: 0,
                },
                bitePositions: {
                    name: "uBitePositions",
                    type: "2fv", // 배열 타입 (vec2 배열)
                    value: new Float32Array(MAX_BITES * 2),
                },
                biteIntensities: {
                    name: "uBiteIntensities",
                    type: "1fv", // 배열 타입 (float 배열)
                    value: new Float32Array(MAX_BITES),
                },
                biteRotations: {
                    name: "uBiteRotations",
                    type: "1fv", // 배열 타입 (float 배열)
                    value: new Float32Array(MAX_BITES),
                },
                biteCount: {
                    name: "uBiteCount",
                    type: "1i",
                    value: 0,
                },
                distortionStrength: {
                    name: "uDistortionStrength",
                    type: "1f",
                    value: CONSTANTS.MAIN_PLANE.distortionStrength,
                },
                biteRadius: {
                    name: "uBiteRadius",
                    type: "1f",
                    value: CONSTANTS.MAIN_PLANE.biteRadius,
                },
                // 엠보싱 효과를 위한 추가 uniform
                blurRadius: {
                    name: "uBlurRadius",
                    type: "1f",
                    value: CONSTANTS.MAIN_PLANE.blurRadius,
                },
                ringThickness: {
                    name: "uRingThickness",
                    type: "1f",
                    value: CONSTANTS.MAIN_PLANE.ringThickness,
                },
                dilation: {
                    name: "uDilation",
                    type: "1f",
                    value: CONSTANTS.MAIN_PLANE.dilation,
                },
                edgeSoftness: {
                    name: "uEdgeSoftness",
                    type: "1f",
                    value: CONSTANTS.MAIN_PLANE.edgeSoftness,
                },
                highlightIntensity: {
                    name: "uHighlightIntensity",
                    type: "1f",
                    value: CONSTANTS.MAIN_PLANE.highlightIntensity,
                },
                shadowIntensity: {
                    name: "uShadowIntensity",
                    type: "1f",
                    value: CONSTANTS.MAIN_PLANE.shadowIntensity,
                },
                lightSpread: {
                    name: "uLightSpread",
                    type: "1f",
                    value: CONSTANTS.MAIN_PLANE.lightSpread,
                }
            }
        };

        // create our plane
        const simplePlane = new Plane(curtains, planeElements[0], params);

        // plane이 준비되면
        simplePlane.onReady(() => {
            simplePlane.setPerspective(35);

            // 미디어의 실제 비율을 반영하여 plane 크기 조정
            const planeElement = planeElements[0];
            const media = planeElement.querySelector('img[data-sampler="uSampler0"]') ||
                         planeElement.querySelector('video[data-sampler="uSampler0"]');

            // 미디어 로드 완료 후 aspect ratio 적용
            const isVideo = media.tagName === 'VIDEO';
            const isLoaded = isVideo ?
                            (media.readyState >= 2 && media.videoWidth > 0) :
                            (media.complete && media.naturalWidth > 0);

            if (isLoaded) {
                adjustPlaneSize(planeElement, media);
                // 비디오인 경우 재생 시작
                if (isVideo && media.paused) {
                    media.play().catch(err => {});
                }
            } else {
                const eventName = isVideo ? 'loadedmetadata' : 'load';
                media.addEventListener(eventName, () => {
                    adjustPlaneSize(planeElement, media);
                    // 비디오인 경우 재생 시작
                    if (isVideo && media.paused) {
                        media.play().catch(err => {});
                    }
                });
            }

            // 마우스 다운 이벤트 핸들러
            function handleMouseDown(e) {
                let clientX, clientY;

                if (e.targetTouches) {
                    // 터치 이벤트
                    clientX = e.targetTouches[0].clientX;
                    clientY = e.targetTouches[0].clientY;
                } else {
                    // 마우스 이벤트
                    clientX = e.clientX;
                    clientY = e.clientY;
                }

                // plane의 실제 위치와 크기 가져오기
                const rect = planeElement.getBoundingClientRect();

                // plane 영역 밖이면 무시
                if (clientX < rect.left || clientX > rect.right ||
                    clientY < rect.top || clientY > rect.bottom) {
                    return;
                }

                // plane 내부 상대 좌표 계산 (0~1 범위)
                const relativeX = (clientX - rect.left) / rect.width;
                const relativeY = (clientY - rect.top) / rect.height;

                isMouseDown = true;
                pressStartTime = Date.now();

                // UV 좌표 계산 (Y축 반전 필요)
                // WebGL 텍스처 좌표는 원점이 왼쪽 하단이므로 Y축을 반전
                const uvX = relativeX;
                const uvY = 1.0 - relativeY; // Y축 반전

                // 현재 인덱스 위치에 값 직접 설정
                const idx = currentBiteIndex % MAX_BITES;

                bitePositions[idx * 2] = uvX;
                bitePositions[idx * 2 + 1] = uvY;
                biteIntensities[idx] = MIN_PRESS_INTENSITY;
                biteRotations[idx] = Math.random() * Math.PI * 2;

                if (biteCount < MAX_BITES) biteCount++;
                currentPressIndex = idx;
                currentBiteIndex++;

                // 유니폼 업데이트
                simplePlane.uniforms.bitePositions.value = bitePositions;
                simplePlane.uniforms.biteIntensities.value = biteIntensities;
                simplePlane.uniforms.biteRotations.value = biteRotations;
                simplePlane.uniforms.biteCount.value = biteCount;
            }

            // 마우스 업 이벤트 핸들러
            function handleMouseUp(e) {
                if (!isMouseDown) return;

                isMouseDown = false;
                const pressDuration = Date.now() - pressStartTime;

                // 최종 intensity 업데이트
                updateBiteIntensity(simplePlane, currentPressIndex, pressDuration);

                currentPressIndex = -1;
            }

            // 이벤트 리스너 등록 (전체 document에 등록하여 모든 영역에서 감지)
            document.addEventListener("mousedown", handleMouseDown);
            document.addEventListener("mouseup", handleMouseUp);
            document.addEventListener("touchstart", handleMouseDown);
            document.addEventListener("touchend", handleMouseUp);

            // HTML 요소 관련 기능 초기화
            initHTMLFeatures();

        }).onRender(() => {
            // 시간 업데이트
            simplePlane.uniforms.time.value++;

            // 마우스를 누르고 있는 동안 intensity를 실시간 업데이트
            if (isMouseDown && currentPressIndex >= 0) {
                const pressDuration = Date.now() - pressStartTime;
                updateBiteIntensity(simplePlane, currentPressIndex, pressDuration);
            }

        }).onAfterResize(() => {
            // 미디어 비율에 맞춰 plane 크기 재조정
            const planeElement = planeElements[0];
            const media = planeElement.querySelector('img[data-sampler="uSampler0"]') ||
                         planeElement.querySelector('video[data-sampler="uSampler0"]');

            if (media) {
                const isVideo = media.tagName === 'VIDEO';
                const isLoaded = isVideo ?
                                (media.videoWidth > 0) :
                                (media.naturalWidth > 0);

                if (isLoaded) {
                    adjustPlaneSize(planeElement, media);
                }
            }

            const planeBoundingRect = simplePlane.getBoundingRect();
            simplePlane.uniforms.resolution.value = [planeBoundingRect.width, planeBoundingRect.height];
        }).onError(() => {
            document.body.classList.add("no-curtains");
        });
    }

    // HTML 요소 관련 기능 초기화 함수
    function initHTMLFeatures() {
        initSmoothScroll();
        initTeethScrollbar();
        
        // 리사이즈 핸들러
        window.addEventListener('resize', () => {
            if (!curtains) return;
            
            // plane의 resolution 업데이트는 onAfterResize에서 처리됨
        });
    }

    // 부드러운 스크롤 초기화 (커스텀 구현)
    function initSmoothScroll() {
        let currentScroll = window.scrollY || window.pageYOffset;
        let targetScroll = currentScroll;
        let ease = 0.08; // 0.05~0.15 (낮을수록 더 부드러움)
        let isScrolling = false;
        let rafId = null;
        
        // Contact 섹션의 끝 위치 계산 함수
        function getMaxScrollHeight() {
            const contactSection = document.getElementById('contact');
            if (contactSection) {
                // contact 섹션의 끝 위치 (섹션의 bottom)
                const contactBottom = contactSection.offsetTop + contactSection.offsetHeight;
                // 화면 높이를 뺀 값이 최대 스크롤 위치
                return Math.max(0, contactBottom - window.innerHeight);
            }
            // contact 섹션이 없으면 기본값 사용
            return document.documentElement.scrollHeight - window.innerHeight;
        }
        
        // 실제 스크롤 위치를 업데이트하는 함수
        function updateScrollPosition() {
            window.scrollTo(0, currentScroll);
        }
        
        // 부드러운 스크롤 루프
        function smoothScrollLoop() {
            // 현재 스크롤을 목표 스크롤에 가깝게 이동
            const diff = targetScroll - currentScroll;
            currentScroll += diff * ease;
            
            // 실제 스크롤 위치 업데이트
            updateScrollPosition();
            
            // 차이가 0.1px 미만이면 완전히 일치시킴
            if (Math.abs(diff) < 0.1) {
                currentScroll = targetScroll;
                updateScrollPosition();
                isScrolling = false;
                return;
            }
            
            // 다음 프레임 요청
            rafId = requestAnimationFrame(smoothScrollLoop);
        }
        
        // 스크롤 이벤트 리스너
        function onScroll(e) {
            // 기본 스크롤 동작 방지
            e.preventDefault();
            
            // 휠 델타 계산
            const delta = e.deltaY || e.detail || -e.wheelDelta;
            targetScroll += delta;
            
            // 스크롤 범위 제한 (contact 섹션 끝까지만)
            const maxScroll = getMaxScrollHeight();
            targetScroll = Math.max(0, Math.min(targetScroll, maxScroll));
            
            if (!isScrolling) {
                isScrolling = true;
                smoothScrollLoop();
            }
        }
        
        // 휠 이벤트 등록
        window.addEventListener('wheel', onScroll, { passive: false });
        
        // 터치 스크롤도 처리 (모바일)
        let touchStartY = 0;
        let touchCurrentY = 0;
        
        window.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
        }, { passive: true });
        
        window.addEventListener('touchmove', (e) => {
            e.preventDefault();
            touchCurrentY = e.touches[0].clientY;
            const delta = touchStartY - touchCurrentY;
            targetScroll += delta * 2; // 터치 스크롤은 더 빠르게
            
            // 스크롤 범위 제한 (contact 섹션 끝까지만)
            const maxScroll = getMaxScrollHeight();
            targetScroll = Math.max(0, Math.min(targetScroll, maxScroll));
            touchStartY = touchCurrentY;
            
            if (!isScrolling) {
                isScrolling = true;
                smoothScrollLoop();
            }
        }, { passive: false });
        
        // 키보드 스크롤 처리
        window.addEventListener('keydown', (e) => {
            const maxScroll = getMaxScrollHeight();
            
            if (e.key === 'ArrowDown' || e.key === 'PageDown') {
                e.preventDefault();
                targetScroll += window.innerHeight * 0.8;
                targetScroll = Math.max(0, Math.min(targetScroll, maxScroll));
                
                if (!isScrolling) {
                    isScrolling = true;
                    smoothScrollLoop();
                }
            } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
                e.preventDefault();
                targetScroll -= window.innerHeight * 0.8;
                targetScroll = Math.max(0, Math.min(targetScroll, maxScroll));
                
                if (!isScrolling) {
                    isScrolling = true;
                    smoothScrollLoop();
                }
            }
        });
        
        // 초기 스크롤 위치 동기화
        currentScroll = window.scrollY || window.pageYOffset;
        targetScroll = currentScroll;
    }

    // Teeth 스크롤바 초기화
    function initTeethScrollbar() {
        const teethScrollbar = document.getElementById('teeth-scrollbar');
        
        if (!teethScrollbar) {
            return;
        }

        const teethLines = document.querySelectorAll('.teeth-line');
        const sections = document.querySelectorAll('.section');
        
        if (!sections || sections.length === 0) {
            return;
        }
        
        function updateTeethScrollbar() {
            const scrollPosition = window.scrollY;
            const windowHeight = window.innerHeight;
            const screenCenter = scrollPosition + windowHeight / 2; // 화면 중앙 기준
            
            // 스크롤바는 항상 화면 하단에 고정
            teethScrollbar.style.position = 'fixed';
            teethScrollbar.style.top = 'auto';
            teethScrollbar.style.bottom = '0.5rem';
            
            let currentSectionId = null;
            let detectedStoryChapter = 0; // 0 = Story section 밖, 1-3 = 챕터 번호
            
            const homeSection = document.getElementById('home');
            const storySection = document.getElementById('story');
            const productSection = document.getElementById('product');
            const contactSection = document.getElementById('contact');
            
            // ----------------------------------------------------
            // [1] Contact section 체크 (가장 아래)
            // ----------------------------------------------------
            if (contactSection) {
                const contactTop = contactSection.offsetTop;
                if (scrollPosition >= contactTop - windowHeight * 0.2) { // Contact 시작점 근처부터 활성화
                    currentSectionId = 'contact';
                }
            }
            
            // ----------------------------------------------------
            // [2] Product section 체크
            // ----------------------------------------------------
            if (!currentSectionId && productSection) {
                const productTop = productSection.offsetTop;
                // Product section 시작점 근처부터 활성화
                if (scrollPosition >= productTop - windowHeight * 0.2) {
                    currentSectionId = 'product';
                }
            }
            
            // ----------------------------------------------------
            // [3] Story section 체크 (스크롤 트리거 사용)
            // ----------------------------------------------------
            if (!currentSectionId && storySection) {
                const storyTop = storySection.offsetTop;
                // Story section 시작점 이후에만 활성화 (Home과 명확히 구분)
                if (scrollPosition >= storyTop) {
                    currentSectionId = 'story';
                    detectedStoryChapter = currentStoryChapter; // 전역 변수 사용
                    
                    // 만약 currentStoryChapter가 0이거나 없으면 ScrollTrigger progress 직접 계산
                    if (!detectedStoryChapter || detectedStoryChapter === 0) {
                        const storyTrigger = ScrollTrigger.getById('3-story-pin');
                        if (storyTrigger && storyTrigger.isActive) {
                            // 전체 진행도를 3개 챕터로 분할 (0~1 → 0~3)
                            const totalProgress = storyTrigger.progress * 3;
                            const currentChapter = Math.min(2, Math.floor(totalProgress));
                            detectedStoryChapter = currentChapter + 1; // 1, 2, 3
                        } else {
                            // Story section에 진입했지만 ScrollTrigger가 아직 활성화되지 않은 경우
                            detectedStoryChapter = 1;
                        }
                    }
                }
            }
            
            // ----------------------------------------------------
            // [4] Home section 체크 (가장 위)
            // ----------------------------------------------------
            if (!currentSectionId && homeSection) {
                // Story section 시작 전이면 명확히 Home
                if (storySection) {
                    const storyTop = storySection.offsetTop;
                    if (scrollPosition < storyTop) {
                        currentSectionId = 'home';
                    }
                } else {
                    // Story section이 없으면 기본값으로 Home
                    currentSectionId = 'home';
                }
            }
            
            // 기본값: Home (모든 체크를 통과하지 못한 경우)
            if (!currentSectionId) {
                currentSectionId = 'home';
            }
            
            // ----------------------------------------------------
            // [5] 스크롤바 라인 업데이트 (Home=1, Story=2,3,4, Product=5, Contact=6)
            // ----------------------------------------------------
            teethLines.forEach((line) => {
                const lineTarget = line.dataset.target; // home, story, product, contact
                const lineChapter = line.dataset.chapter; // story의 챕터 번호
                const lineNumber = parseInt(line.dataset.section) + 1; // 1, 2, 3, 4, 5, 6
                
                let isActive = false;
                
                // Home: lineNumber가 1
                if (lineNumber === 1 && currentSectionId === 'home') {
                    isActive = true;
                }
                // Story: lineNumber가 2, 3, 4
                else if (lineNumber >= 2 && lineNumber <= 4 && currentSectionId === 'story') {
                    if (parseInt(lineChapter) === detectedStoryChapter) {
                        isActive = true;
                    }
                }
                // Product: lineNumber가 5
                else if (lineNumber === 5 && currentSectionId === 'product') {
                    isActive = true;
                }
                // Contact: lineNumber가 6
                else if (lineNumber === 6 && currentSectionId === 'contact') {
                    isActive = true;
                }
                
                // SVG 업데이트
                if (isActive) {
                    line.src = `assets/scrollbar/thick${lineNumber}.svg`;
                } else {
                    line.src = `assets/scrollbar/thin${lineNumber}.svg`;
                }
            });
        }
        
        teethLines.forEach((line) => {
            line.addEventListener('click', () => {
                const targetId = line.dataset.target;
                const targetSection = document.getElementById(targetId);
                
                if (targetSection) {
                    targetSection.scrollIntoView({ 
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
        
        window.addEventListener('scroll', updateTeethScrollbar);
        updateTeethScrollbar();
    }

    // 헤더 탭 클릭 이벤트
    function initHeaderTabs() {
        const headerTabs = document.querySelectorAll('.header-tab');
        
        headerTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetSection = tab.dataset.tab;
                const section = document.getElementById(targetSection);
                
                if (section) {
                    // 모든 탭에서 active 제거
                    headerTabs.forEach(t => t.classList.remove('active'));
                    // 클릭한 탭에 active 추가
                    tab.classList.add('active');
                    
                    // 섹션으로 스크롤
                    section.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
    }

    // Home 섹션 배경 이미지 공개 애니메이션 (ScrollTrigger 버전)
    function initHomeReveal() {
        const homeSection = document.getElementById('home');
        const homeContainer = homeSection ? homeSection.querySelector('.section-container') : null;
        const homeBackground = document.querySelector('.home-background');
        const storySection = document.getElementById('story');

        if (!homeContainer || !homeBackground || !storySection) {
            console.warn('⚠️ Home section elements not found');
            return;
        }

        // 1단계 (0~100vh): Home 섹션만 위로 올라감, background는 고정
gsap.to(homeContainer, {
        yPercent: -100,
        ease: 'none',
        scrollTrigger: {
            trigger: homeSection,
            start: 'top top',
            end: 'bottom top',
            scrub: true,
            // markers: true, // 디버깅용
            id: '1-home-content'
        }
    });

        // 2단계 (100vh~150vh): background를 -51vh 위치로 이동
gsap.to(homeBackground, {
        y: '-51vh',
        ease: 'none',
        scrollTrigger: {
            trigger: homeSection,
            start: 'bottom bottom',      // Home이 끝나는 지점(100vh)부터
            end: '+=550vh',            // 50vh 동안만 이동 (150vh 지점까지)
            scrub: true,
            id: '2-bg-move-partial'
        }
    });

        console.log('✅ Home Reveal 초기화 완료');
    }

    // Story 섹션 스크롤 애니메이션 (3개 챕터)
    function initStoryScroll() {
        const storySection = document.getElementById('story');
        const homeSection = document.getElementById('home');
        const homeBackground = document.querySelector('.home-background');

        if (!storySection || !homeSection || !homeBackground) {
            console.warn('⚠️ Story section not found');
            return;
        }

        // 챕터 데이터
        const chapters = [
            {
                chapter: 1,
                titleLeft: 'BEWARE',
                titleCenter: 'THE',
                titleRight: 'SMOOTH',
                number: '1',
                textEn: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Praesent fringilla erat sit amet efficitur suscipit.',
                textKo: '국가는 노인과 청소년의 복지향상을 위한 정책을 실시할 의무를 진다. 언론・출판에 대한 허가나 검열과 집회・결사에 대한 인허가지 아니한다.'
            },
            {
                chapter: 2,
                titleLeft: 'SEEK',
                titleCenter: 'THE',
                titleRight: 'ROUGH',
                number: '2',
                textEn: 'Chapter 2 content goes here. This is example text for the second chapter.',
                textKo: '두 번째 챕터의 한글 내용이 여기에 들어갑니다. 이것은 예시 텍스트입니다.'
            },
            {
                chapter: 3,
                titleLeft: 'EMBRACE',
                titleCenter: 'THE',
                titleRight: 'TEXTURE',
                number: '3',
                textEn: 'Chapter 3 content goes here. This is example text for the third chapter.',
                textKo: '세 번째 챕터의 한글 내용이 여기에 들어갑니다. 이것은 예시 텍스트입니다.'
            }
        ];

        // DOM 요소 - 타이틀
        const titleLeft = document.getElementById('story-title-left');
        const titleCenter = document.getElementById('story-title-center');
        const titleRight = document.getElementById('story-title-right');

        // DOM 요소 - 콘텐츠 (좌/중/우)
        const contentLeft = document.getElementById('story-content-left');
        const contentCenter = document.getElementById('story-content-center');
        const contentRight = document.getElementById('story-content-right');
        const contentContainers = [contentLeft, contentCenter, contentRight];

        // DOM 요소 - 챕터 표시 (중앙)
        const chapterDisplay = document.getElementById('story-chapter-display');

        if (!titleLeft || !titleCenter || !titleRight || !chapterDisplay || contentContainers.some(el => !el)) {
            console.warn('⚠️ Story elements not found');
            return;
        }

        // 챕터 콘텐츠 업데이트 함수 (display만 제어)
        function updateChapterContent(index) {
            const chapter = chapters[index];

            // Title 텍스트 즉시 변경
            titleLeft.textContent = chapter.titleLeft;
            titleCenter.textContent = chapter.titleCenter;
            titleRight.textContent = chapter.titleRight;

            // CH 표기 업데이트
            chapterDisplay.textContent = `CH ${chapter.chapter}`;

            // Home background 이미지 업데이트 (챕터에 따라 story1.png, story2.png, story3.png)
            const homeBackground = document.querySelector('.home-background');
            if (homeBackground) {
                const backgroundImg = homeBackground.querySelector('img');
                if (backgroundImg) {
                    backgroundImg.src = `assets/images/story${index + 1}.png`;
                }
            }

            // 모든 콘텐츠 표시/숨김 (즉시 반영)
            // display 대신 visibility 사용하여 Grid 레이아웃 유지
            contentContainers.forEach((el, idx) => {
                if (el) {
                    if (idx === index) {
                        el.style.visibility = 'visible';
                        el.style.opacity = '1';
                    } else {
                        el.style.visibility = 'hidden';
                        el.style.opacity = '0';
                    }
                }
            });
        }

        // Threshold 효과 적용 함수 (Title만)
        function applyThresholdEffect(blurAmount) {
            // Title에만 --blur-amount CSS 변수 업데이트
            const titleElements = [titleLeft, titleCenter, titleRight];

            titleElements.forEach(el => {
                if (el) el.style.setProperty('--blur-amount', blurAmount);
            });
        }

        // 초기 챕터 표시
        updateChapterContent(0);

        // 3단계 (150vh~450vh): Story 섹션 고정, 3개 챕터 전환 (threshold 효과)
        ScrollTrigger.create({
            trigger: storySection,
            start: 'top top',
            end: '+=1200vh',
            pin: true,
            pinSpacing: true,
            id: '3-story-pin',
            onEnter: (self) => {
                // 첫 진입 시 lastChapter 초기화 (이미 표시된 챕터 0)
                self.lastChapter = 0;
            },
            onUpdate: (self) => {
                // 전체 진행도를 3개 챕터로 분할 (0~1 → 0~3)
                const totalProgress = self.progress * 3;
                
                // 현재 챕터 내 진행도 계산 (각 챕터는 0~1 범위)
                const currentChapterFloat = totalProgress;
                const currentChapter = Math.min(2, Math.floor(currentChapterFloat));
                const chapterProgress = currentChapterFloat - currentChapter;

                // Threshold 효과 적용
                // 0~0.5: 현재 챕터 사라짐 (blur 0→최대)
                // 0.5: 텍스트 변경 (blur 최대)
                // 0.5~1.0: 다음 챕터 나타남 (blur 최대→0)
                let blurAmount;
                if (chapterProgress < 0.5) {
                    // 사라지는 단계: blur 0 → 25
                    blurAmount = chapterProgress * 50; // 0~25
                } else {
                    // 나타나는 단계: blur 25 → 0
                    blurAmount = (1 - chapterProgress) * 50; // 25~0
                }

                // Blur 효과 적용
                applyThresholdEffect(blurAmount);

                // 챕터 전환 로직
                // chapterProgress < 0.5: 현재 챕터 표시 (blur 증가 중)
                // chapterProgress >= 0.5: 다음 챕터 표시 (blur 감소 중)
                let targetChapter = currentChapter;
                if (chapterProgress >= 0.5 && currentChapter < 2) {
                    // 다음 챕터로 전환
                    targetChapter = currentChapter + 1;
                }

                // 챕터가 변경되었을 때만 업데이트
                if (self.lastChapter !== targetChapter) {
                    updateChapterContent(targetChapter);
                    self.lastChapter = targetChapter;
                }
                
                // 스크롤바를 위한 현재 챕터 업데이트 (전환 중에는 다음 챕터로 표시)
                currentStoryChapter = targetChapter + 1; // 1, 2, 3
            }
        });

// 4단계 (1200vh~1250vh): Story pin이 끝나는 즉시 Background도 같이 이동
gsap.fromTo(homeBackground, 
    { 
        y: '-51vh' // [중요] 시작 위치를 강제로 지정 (2단계가 끝난 위치)
    },
    {
        y: '-100vh', // 목표 위치
        ease: 'none',
        immediateRender: false, // [중요] 미리 렌더링되어 위치가 튀는 것을 방지
        scrollTrigger: {
            trigger: storySection,
            start: 'top+=1vh top', // 3단계 Pin이 끝나는 정확한 지점
            end: '+=500vh', // 자연스럽게 사라지는 거리
            scrub: true,
            id: '4-bg-final-move'
        }
    }
);

        console.log('✅ Story Scroll 초기화 완료');
    }

    // Product 섹션 데이터 및 아코디언 초기화
    function initProductSection() {
        // 상품 데이터
        const products = [
            {
                id: 1,
                nameEn: 'STONE JERKY',
                nameKo: '석육',
                nameKoHanja: '石肉',
                type: '건조저장육류',
                weight: '1.27kg',
                calories: '4,435kcal',
                description: `소고기의 살코기만을 사용,
수분을 4% 미만으로 제거해 만든 육포.
석육은 70kg/cm² 이상의 압력을 가해
조직을 재결합시킨 고밀도 압축체다.
씹는 행위의 잊힌 원초적 질감을
회복하기 위해 고안된 비정형의 덩어리.`,
                image: 'assets/images/product1.jpg',
                specs: {
                    hardness: '95 Shore (A)',
                    tensile: '50 kgf/cm²',
                    moisture: '< 4%',
                    totalWeight: '1.27kg (4,435kcal)',
                    ingredients: '소고기(홍두깨살/호주산) 97%, 정제소금(국내산) 2%, 흑후추(베트남산) 1%'
                },
                nutrition: [
                    { name: '나트륨', value: '3,000mg', percent: '150%' },
                    { name: '탄수화물', value: '4g', percent: '1%' },
                    { name: '당류', value: '1g', percent: '1%' },
                    { name: '지방', value: '15g', percent: '19%' },
                    { name: '포화지방', value: '7g', percent: '35%' },
                    { name: '콜레스테롤', value: '120mg', percent: '40%' },
                    { name: '단백질', value: '50g', percent: '100%' }
                ]
            },
            {
                id: 2,
                nameEn: 'BARK SLAB',
                nameKo: '목전',
                nameKoHanja: '木塼',
                type: '곡물 가공품',
                weight: '1.5kg',
                calories: '3,800kcal',
                description: `곡물의 외피와 숯 가루,
그리고 강한 섬유질의 나무껍질을 혼합해 만든 빵. 유기물을 재료로 압력을 가해 만든 고밀도 압축 성형체다. 완성된
검은 덩어리는 일반적인 빵의 다공성
구조와 달리 촘촘하다.`,
                image: 'assets/images/product2.jpg',
                specs: {
                    hardness: '98 Shore (A)',
                    tensile: '35 kgf/cm²',
                    moisture: '< 3%',
                    totalWeight: '1.5kg (3,800kcal)',
                    ingredients: '호밀 통곡물(국내산) 50%, 소나무 속껍질 분말(식용) 30%, 식용 숯 가루 10%, 맥아당 9.8%, 정제소금 0.2%'
                },
                nutrition: [
                    { name: '나트륨', value: '75mg', percent: '4%' },
                    { name: '탄수화물', value: '55g', percent: '17%' },
                    { name: '당류', value: '2g', percent: '2%' },
                    { name: '지방', value: '4g', percent: '7%' },
                    { name: '포화지방', value: '0g', percent: '0%' },
                    { name: '콜레스테롤', value: '0mg', percent: '0%' },
                    { name: '단백질', value: '15g', percent: '27%' }
                ]
            },
            {
                id: 3,
                nameEn: 'TENDON CABLE',
                nameKo: '근삭',
                nameKoHanja: '筋索',
                type: '건조저장육류',
                weight: '0.5kg',
                calories: '2,215kcal',
                description: `돈육에서 순수한 힘줄 섬유를 추출하여,
여러 가닥으로 엮고 고온으로 경화시켜 제작된 간식이다. 턱의 인장력과
지속적인 저작 활동을 측정하기 위해
설계된 도구. 완성된 식품은 밧줄과
유사한 장력을 유지한다.`,
                image: 'assets/images/product3.jpg',
                specs: {
                    hardness: '99 Shore (A)',
                    tensile: '120 kgf/cm²',
                    moisture: '< 1%',
                    totalWeight: '0.5kg (2,215kcal)',
                    ingredients: '돈힘줄(국내산) 99%, 정제수, 소금'
                },
                nutrition: [
                    { name: '나트륨', value: '500mg', percent: '25%' },
                    { name: '탄수화물', value: '0g', percent: '0%' },
                    { name: '당류', value: '0g', percent: '0%' },
                    { name: '지방', value: '60g', percent: '109%' },
                    { name: '포화지방', value: '25g', percent: '167%' },
                    { name: '콜레스테롤', value: '750mg', percent: '250%' },
                    { name: '단백질', value: '400g', percent: '727%' }
                ]
            }
        ];

        const productList = document.getElementById('product-list');
        if (!productList) {
            return;
        }

        // HTML 생성
        products.forEach((product) => {
            const productItem = document.createElement('div');
            productItem.className = 'product-item';
            productItem.dataset.product = product.id;

            // 접힌 상태 (타이틀)
            const titleHtml = `
                <div class="product-title">
                    <div class="product-name-en">${product.nameEn}</div>
                    <div class="product-name-ko">${product.nameKo} (${product.nameKoHanja})</div>
                    <div class="product-info-right">
                        <div class="product-info-brief">${product.type} | ${product.weight} | ${product.calories}</div>
                        <span class="product-toggle">+</span>
                    </div>
                </div>
            `;

            // 펼친 상태 (상세 정보 - 3x2 그리드)
            const contentHtml = `
                <div class="product-content">
                    <div class="product-detail-grid">
                        <!-- 1행: 이미지 (3단 전체) -->
                        <div class="product-image">
                            <img src="${product.image}" alt="${product.nameEn}">
                        </div>

                        <!-- 2행: 3단 분할 -->
                        <!-- 1단: 설명 -->
                        <div class="product-description">
                            <h3>${product.nameEn}<br>${product.nameKo} (${product.nameKoHanja})</h3>
                            <p class="korean-body-text">${product.description.replace(/\n/g, '<br>')}</p>
                        </div>

                        <!-- 2단: 식품 제공 사항 -->
                        <div class="product-specs">
                            <h3>식품 제공 사항</h3>
                            <div class="spec-item">
                                <span>경도</span>
                                <span>${product.specs.hardness}</span>
                            </div>
                            <div class="spec-item">
                                <span>인장 강도</span>
                                <span>${product.specs.tensile}</span>
                            </div>
                            <div class="spec-item">
                                <span>수분 함량</span>
                                <span>${product.specs.moisture}</span>
                            </div>
                            <div class="spec-item">
                                <span>내용량</span>
                                <span>${product.specs.totalWeight}</span>
                            </div>
                            <p class="korean-body-text" style="margin-top: 1rem; font-size: 0.8rem;">
                                원재료명: ${product.specs.ingredients}
                            </p>
                        </div>

                        <!-- 3단: 영양 정보 -->
                        <div class="product-nutrition">
                            <h3>영양 정보</h3>
                            <p style="font-size: 0.8rem; margin-bottom: 0.5rem;">100g당 함량 표기</p>
                            ${product.nutrition.map(item => `
                                <div class="nutrition-item">
                                    <span>${item.name}</span>
                                    <span>${item.value} (${item.percent})</span>
                                </div>
                            `).join('')}
                            <p class="korean-body-text" style="margin-top: 1rem; font-size: 0.75rem;">
                                1일 영양성분 기준치에 대한 비율(%)은 2,000kcal 기준이므로 개인 필요 열량에 따라 다를 수 있습니다.
                            </p>
                        </div>
                    </div>
                </div>
            `;

            productItem.innerHTML = titleHtml + contentHtml;
            productList.appendChild(productItem);
        });

        // 아코디언 기능 추가
        const productItems = document.querySelectorAll('.product-item');
        
        productItems.forEach((item) => {
            const titleEl = item.querySelector('.product-title');
            const contentEl = item.querySelector('.product-content');
            
            if (!titleEl || !contentEl) return;

            titleEl.addEventListener('click', () => {
                const isActive = item.classList.contains('active');
                
                // 다른 모든 아이템 닫기
                productItems.forEach((otherItem) => {
                    if (otherItem !== item) {
                        otherItem.classList.remove('active');
                        const otherContent = otherItem.querySelector('.product-content');
                        if (otherContent && gsap) {
                            gsap.to(otherContent, {
                                height: 0,
                                opacity: 0,
                                duration: 0.5,
                                ease: 'power2.inOut'
                            });
                        }
                    }
                });

                // 현재 아이템 토글
                if (isActive) {
                    // 닫기
                    item.classList.remove('active');
                    if (gsap) {
                        gsap.to(contentEl, {
                            height: 0,
                            opacity: 0,
                            duration: 0.5,
                            ease: 'power2.inOut',
                            onComplete: () => {
                                // Product section 높이 재계산 (Contact section 위치 조정)
                                const productSection = document.getElementById('product');
                                if (productSection) {
                                    productSection.style.height = 'auto';
                                }
                            }
                        });
                    }
                } else {
                    // 열기
                    item.classList.add('active');
                    
                    if (gsap) {
                        // 요소들 선택
                        const imageEl = contentEl.querySelector('.product-image');
                        const descEl = contentEl.querySelector('.product-description');
                        const specsEl = contentEl.querySelector('.product-specs');
                        const nutritionEl = contentEl.querySelector('.product-nutrition');
                        
                        // 초기 상태 설정
                        gsap.set([imageEl, descEl, specsEl, nutritionEl], {
                            opacity: 0
                        });
                        gsap.set(imageEl, { scale: 0.95 });
                        gsap.set([descEl, specsEl, nutritionEl], { y: 20 });
                        
                        // 자연스러운 높이 계산
                        gsap.set(contentEl, { height: 'auto', opacity: 1 });
                        const autoHeight = contentEl.offsetHeight;
                        
                        // 높이 애니메이션
                        gsap.fromTo(contentEl, 
                            { height: 0 },
                            {
                                height: autoHeight,
                                duration: 0.6,
                                ease: 'power2.inOut',
                                onComplete: () => {
                                    gsap.set(contentEl, { height: 'auto' });
                                    // Product section 높이 재계산 (Contact section 위치 조정)
                                    const productSection = document.getElementById('product');
                                    if (productSection) {
                                        // 강제로 리플로우 트리거
                                        productSection.style.height = 'auto';
                                    }
                                }
                            }
                        );
                        
                        // 이미지 애니메이션 (fade-in + scale)
                        gsap.to(imageEl, {
                            opacity: 1,
                            scale: 1,
                            duration: 0.6,
                            delay: 0.2,
                            ease: 'power2.out'
                        });
                        
                        // 텍스트 순차 애니메이션 (좌→중→우)
                        gsap.to(descEl, {
                            opacity: 1,
                            y: 0,
                            duration: 0.5,
                            delay: 0.4,
                            ease: 'power2.out'
                        });
                        
                        gsap.to(specsEl, {
                            opacity: 1,
                            y: 0,
                            duration: 0.5,
                            delay: 0.5,
                            ease: 'power2.out'
                        });
                        
                        gsap.to(nutritionEl, {
                            opacity: 1,
                            y: 0,
                            duration: 0.5,
                            delay: 0.6,
                            ease: 'power2.out'
                        });
                    }
                }
            });
        });

        console.log('✅ Product Accordion 초기화 완료');
    }

    // HTML 기능 초기화에서 헤더 탭, Home Reveal, Story Scroll, Product 초기화
    // Contact Credit 기능 초기화
    function initContactCredit() {
        const creditButton = document.getElementById('contact-credit');
        const creditPanel = document.getElementById('credit-panel');
        const creditNames = document.getElementById('credit-names');
        
        if (!creditButton || !creditPanel || !creditNames) {
            return;
        }
        
        // 친구 이름 목록 (역할&이름 형식으로 추가하세요)
        const credits = [
            { role: 'Article', name: '이소담' },
            { role: 'Photo Model', name: '서효리' },
            { role: 'Help', name: '김수아' },
            { role: '', name: '이윤서' },
            { role: '', name: '손효주' }

        ];
        
        // 친구 이름들을 HTML로 생성
        credits.forEach(credit => {
            const creditElement = document.createElement('p');
            if (credit.role && credit.role.trim() !== '') {
                creditElement.innerHTML = `<strong>${credit.role}</strong> ${credit.name}`;
            } else {
                creditElement.textContent = credit.name;
            }
            creditNames.appendChild(creditElement);
        });
        
        let isPanelVisible = false;
        
        // CREDIT 클릭 시 패널 토글
        creditButton.addEventListener('click', (e) => {
            e.stopPropagation();
            isPanelVisible = !isPanelVisible;
            
            if (isPanelVisible) {
                creditPanel.style.display = 'block';
                if (typeof gsap !== 'undefined') {
                    gsap.fromTo(creditPanel,
                        { opacity: 0, y: 10 },
                        { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
                    );
                }
            } else {
                if (typeof gsap !== 'undefined') {
                    gsap.to(creditPanel, {
                        opacity: 0,
                        y: 10,
                        duration: 0.3,
                        ease: 'power2.in',
                        onComplete: () => {
                            creditPanel.style.display = 'none';
                        }
                    });
                } else {
                    creditPanel.style.display = 'none';
                }
            }
        });
        
        // 패널 외부 클릭 시 닫기
        document.addEventListener('click', (e) => {
            if (isPanelVisible && !creditPanel.contains(e.target) && e.target !== creditButton) {
                isPanelVisible = false;
                if (typeof gsap !== 'undefined') {
                    gsap.to(creditPanel, {
                        opacity: 0,
                        y: 10,
                        duration: 0.3,
                        ease: 'power2.in',
                        onComplete: () => {
                            creditPanel.style.display = 'none';
                        }
                    });
                } else {
                    creditPanel.style.display = 'none';
                }
            }
        });
    }

    const originalInitHTMLFeatures = initHTMLFeatures;
    initHTMLFeatures = function() {
        originalInitHTMLFeatures();
        initHeaderTabs();
        initHomeReveal();
        initStoryScroll();
        initProductSection();
        initContactCredit();
    };

    // 디버깅용 - ESC 키로 로딩 스킵
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && loadingPage && loadingPage.style.display !== 'none') {
            loadingProgress = 1.0;
            if (loadingPercentageCenter) {
                loadingPercentageCenter.textContent = '100';
            }
            startMainPage();
        }
    });
});

